// services/client.mjs - Client-related operations

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES, S3_CONFIG } from "../config/aws.mjs";
import { generatePresignedUrl } from "../utils/s3.mjs";

export async function loadClient(clientID) {
  if (!clientID) return null;

  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLES.CLIENTS,
        Key: { id: clientID },
      })
    );

    if (!res.Item) return null;

    const client = res.Item;

    // Generate presigned URL for logo if it exists
    let logoUrl = null;
    if (client.logo) {
      try {
        const logoKey = `public/${client.logo}`;
        // 24 hours expiry for logo
        logoUrl = await generatePresignedUrl(
          S3_CONFIG.BUCKET,
          logoKey,
          24 * 60 * 60 // 24 hours in seconds
        );
      } catch (e) {
        // Logo file might not exist in S3, or other S3 error
        console.warn(`Logo not accessible for client ${clientID}:`, e.message);
        // logoUrl remains null
      }
    }

    // Return only the fields we want to expose
    const clientData = {
      name: client.name || null,
      primaryColor: client.primaryColor || null,
      secondaryColor: client.secondaryColor || null,
      street1: client.street1 || null,
      street2: client.street2 || null,
      city: client.city || null,
      state: client.state || null,
      zip: client.zip || null,
      country: client.country || null,
      website: client.website || null,
      phone: client.phone || null,
    };

    // Only include logoUrl if we successfully generated one
    if (logoUrl) {
      clientData.logoUrl = logoUrl;
    }

    return clientData;
  } catch (e) {
    // Failed to load client
    return null;
  }
}
