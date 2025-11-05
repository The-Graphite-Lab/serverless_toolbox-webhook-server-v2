// auth/cognito.mjs - Cognito authentication and authorization

import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import cognitoSrpHelper from "cognito-srp-helper";
import { cognitoClient, COGNITO_CONFIG } from "../config/aws.mjs";
import { loadUser } from "../services/user.mjs";
import { getCookieMap } from "./cookie.mjs";

// Platform-wide cookie names
export const COGNITO_ID_TOKEN_COOKIE = "tgl_web";
export const COGNITO_REFRESH_TOKEN_COOKIE = "tgl_web_refresh";

// Create JWT verifier for ID tokens
// Note: clientId can be null for ID tokens, but aws-jwt-verify requires explicit null
const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_CONFIG.USER_POOL_ID,
  tokenUse: "id",
  clientId: COGNITO_CONFIG.CLIENT_ID || null,
});

// Token expiration buffer (refresh if expiring within 5 minutes)
const TOKEN_REFRESH_BUFFER_SEC = 5 * 60;

/**
 * Authenticate user with Cognito username/password using SRP
 * @param {string} username - Cognito username
 * @param {string} password - User password
 * @returns {Promise<Object>} { ok: boolean, tokens?: { idToken, refreshToken }, error?: string }
 */
export async function authenticateUser(username, password) {
  if (!COGNITO_CONFIG.CLIENT_ID) {
    return { ok: false, error: "Cognito client not configured" };
  }

  try {
    // Use cognito-srp-helper to handle SRP authentication
    // Step 1: Create SRP session first (this calculates SRP_A)
    // createSrpSession takes positional params: (username, password, poolId, isHashed?)
    const session = cognitoSrpHelper.createSrpSession(
      username,
      password,
      COGNITO_CONFIG.USER_POOL_ID,
      false // isHashed = false (password is plain text)
    );

    // Step 2: Initiate SRP auth with SRP_A
    const initiateCommandInput = {
      AuthFlow: "USER_SRP_AUTH",
      ClientId: COGNITO_CONFIG.CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
      },
    };

    // Wrap the command input with SRP_A from session
    const wrapped = cognitoSrpHelper.wrapInitiateAuth(
      session,
      initiateCommandInput
    );

    // Merge AuthParameters from wrapped result (has SRP_A) into input
    const wrappedInput = {
      ...initiateCommandInput,
      AuthParameters: {
        ...initiateCommandInput.AuthParameters,
        ...wrapped.AuthParameters, // This contains SRP_A
      },
    };

    // Create command from wrapped input
    const initiateCommand = new InitiateAuthCommand(wrappedInput);

    const initiateResponse = await cognitoClient.send(initiateCommand);

    if (
      !initiateResponse.ChallengeName ||
      initiateResponse.ChallengeName !== "PASSWORD_VERIFIER"
    ) {
      return { ok: false, error: "Unexpected challenge from Cognito" };
    }

    // Debug: Check what we received
    console.log("Initiate response:", {
      ChallengeName: initiateResponse.ChallengeName,
      hasChallengeParameters: !!initiateResponse.ChallengeParameters,
      challengeParamsKeys: initiateResponse.ChallengeParameters
        ? Object.keys(initiateResponse.ChallengeParameters)
        : [],
    });

    // Step 3: Sign the SRP session with challenge parameters
    // signSrpSession expects an object with ChallengeParameters property
    const signedSession = cognitoSrpHelper.signSrpSession(
      session,
      initiateResponse // Pass the full response object
    );

    // Step 4: Respond to auth challenge
    // signedSession has passwordSignature (not signature) and timestamp
    const respondCommand = new RespondToAuthChallengeCommand({
      ClientId: COGNITO_CONFIG.CLIENT_ID,
      ChallengeName: "PASSWORD_VERIFIER",
      ChallengeResponses: {
        USERNAME:
          initiateResponse.ChallengeParameters.USER_ID_FOR_SRP || username,
        PASSWORD_CLAIM_SIGNATURE: signedSession.passwordSignature,
        PASSWORD_CLAIM_SECRET_BLOCK:
          initiateResponse.ChallengeParameters.SECRET_BLOCK,
        TIMESTAMP: signedSession.timestamp,
      },
      Session: initiateResponse.Session,
    });

    const respondResponse = await cognitoClient.send(respondCommand);

    if (respondResponse.AuthenticationResult) {
      return {
        ok: true,
        tokens: {
          idToken: respondResponse.AuthenticationResult.IdToken,
          refreshToken: respondResponse.AuthenticationResult.RefreshToken,
        },
      };
    }

    return { ok: false, error: "Authentication failed" };
  } catch (error) {
    console.error("Cognito SRP authentication error:", error.message);
    console.error("Error details:", error);

    // Handle common Cognito errors
    if (error.name === "NotAuthorizedException") {
      return { ok: false, error: "Invalid username or password" };
    }
    if (error.name === "UserNotConfirmedException") {
      return { ok: false, error: "User account not confirmed" };
    }
    if (error.name === "UserNotFoundException") {
      return { ok: false, error: "Invalid username or password" };
    }

    return { ok: false, error: "Authentication failed. Please try again." };
  }
}

/**
 * Refresh Cognito tokens using refresh token
 * @param {string} refreshToken - Cognito refresh token
 * @returns {Promise<Object>} { ok: boolean, tokens?: { idToken, refreshToken }, error?: string }
 */
export async function refreshCognitoTokens(refreshToken) {
  if (!COGNITO_CONFIG.CLIENT_ID) {
    return { ok: false, error: "Cognito client not configured" };
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: COGNITO_CONFIG.CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const response = await cognitoClient.send(command);

    if (response.AuthenticationResult) {
      return {
        ok: true,
        tokens: {
          idToken: response.AuthenticationResult.IdToken,
          refreshToken: refreshToken, // Refresh token stays the same unless rotated
        },
      };
    }

    return { ok: false, error: "Token refresh failed" };
  } catch (error) {
    console.error("Cognito token refresh error:", error.message);
    return { ok: false, error: "Session expired. Please log in again." };
  }
}

/**
 * Verify Cognito ID token and extract user info
 * @param {string} idToken - Cognito ID token
 * @returns {Promise<Object>} { ok: boolean, payload?: Object, error?: string }
 */
export async function verifyCognitoToken(idToken) {
  try {
    const payload = await idTokenVerifier.verify(idToken);
    return { ok: true, payload };
  } catch (error) {
    console.error("Cognito token verification error:", error.message);
    return { ok: false, error: "Invalid token" };
  }
}

/**
 * Check if token is expiring soon (within buffer time)
 * @param {Object} payload - JWT payload with 'exp' claim
 * @returns {boolean} True if token is expiring soon
 */
export function isTokenExpiringSoon(payload) {
  if (!payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = payload.exp;
  return expiresAt - now < TOKEN_REFRESH_BUFFER_SEC;
}

/**
 * Extract Cognito tokens from request cookies
 * @param {Object} event - Lambda event object
 * @returns {Object} { idToken?: string, refreshToken?: string }
 */
export function extractCognitoTokens(event) {
  // API Gateway v2 sends cookies as an array in event.cookies
  // Also check headers.cookie for compatibility
  const cookieSource = event.cookies
    ? event.cookies.join("; ")
    : event.headers?.cookie || event.headers?.Cookie || "";

  const cookieMap = getCookieMap(cookieSource);

  return {
    idToken: cookieMap[COGNITO_ID_TOKEN_COOKIE],
    refreshToken: cookieMap[COGNITO_REFRESH_TOKEN_COOKIE],
  };
}

/**
 * Verify Cognito authentication and check user authorization for instance
 * @param {Object} event - Lambda event object
 * @param {Object} instance - Webhook instance object
 * @param {Object} webhook - Webhook object (contains ClientID)
 * @returns {Promise<Object>} { ok: boolean, authenticated: boolean, authorized: boolean, user?: Object, error?: string }
 */
export async function verifyCognitoAuthAndAuthorization(
  event,
  instance,
  webhook
) {
  // Extract tokens from cookies
  const { idToken, refreshToken } = extractCognitoTokens(event);

  // No tokens - not authenticated
  if (!idToken) {
    return { ok: false, authenticated: false, authorized: false };
  }

  // Verify ID token
  const verifyResult = await verifyCognitoToken(idToken);

  if (!verifyResult.ok) {
    // Token invalid - try refresh if refresh token available
    if (refreshToken) {
      const refreshResult = await refreshCognitoTokens(refreshToken);
      if (refreshResult.ok) {
        // Token refreshed - verify new token
        const newVerifyResult = await verifyCognitoToken(
          refreshResult.tokens.idToken
        );
        if (newVerifyResult.ok) {
          // Use refreshed token
          return {
            ok: true,
            authenticated: true,
            tokens: refreshResult.tokens,
            payload: newVerifyResult.payload,
          };
        }
      }
    }
    // Refresh failed or no refresh token - require re-login
    return {
      ok: false,
      authenticated: false,
      authorized: false,
      requireLogin: true,
    };
  }

  const payload = verifyResult.payload;

  // Check if token is expiring soon and refresh proactively
  if (refreshToken && isTokenExpiringSoon(payload)) {
    const refreshResult = await refreshCognitoTokens(refreshToken);
    if (refreshResult.ok) {
      const newVerifyResult = await verifyCognitoToken(
        refreshResult.tokens.idToken
      );
      if (newVerifyResult.ok) {
        return {
          ok: true,
          authenticated: true,
          tokens: refreshResult.tokens,
          payload: newVerifyResult.payload,
        };
      }
    }
  }

  // Token is valid - check authorization
  const userId = payload.sub;
  const user = await loadUser(userId);

  if (!user) {
    return {
      ok: false,
      authenticated: true,
      authorized: false,
      error: "User not found",
    };
  }

  // Check authorization: admin OR matching ClientID
  const isAuthorized =
    user.type === "admin" || user.ClientID === webhook.ClientID;

  return {
    ok: isAuthorized,
    authenticated: true,
    authorized: isAuthorized,
    user,
    payload,
  };
}
