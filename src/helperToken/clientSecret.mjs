// helperToken/clientSecret.mjs
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({ region: "us-east-2" });

export async function getClientSecret(clientId) {
  const name = `Client_${clientId}_EncodingSecret`;
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: name }));
  const parsed = JSON.parse(res.SecretString || "{}");
  if (!parsed.value) throw new Error(`Secret ${name} missing "value"`);
  return parsed.value;
}
