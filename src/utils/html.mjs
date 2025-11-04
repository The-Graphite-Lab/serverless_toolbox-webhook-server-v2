// utils/html.mjs - HTML template utilities

// Replace {{var}} outside <script>, and quote-empty inside <script>
// Supports nested properties like {{client.name}}
export function replaceHtmlVariables(htmlString, inputs) {
  const scriptTagRanges = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRegex.exec(htmlString)) !== null) {
    scriptTagRanges.push({ start: m.index, end: m.index + m[0].length });
  }
  const inScript = (i) =>
    scriptTagRanges.some((r) => i >= r.start && i <= r.end);

  // Helper function to get nested property value
  const getNestedValue = (obj, path) => {
    const keys = path.split(".");
    let value = obj;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  };

  return htmlString
    .replace(/{{(.*?)}}/g, (match, variable, offset) => {
      if (variable === "postEvent") return match;
      const varName = variable.trim();
      const replacement = getNestedValue(inputs, varName);
      return inScript(offset) ? replacement ?? '""' : replacement ?? "";
    })
    ?.replace(/"{4}/g, '""');
}

// Replace {{postEvent}} with JSON-safe content
export async function replaceHtmlWithEvent(htmlString, postEvent) {
  const safe = JSON.stringify(postEvent)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027")
    .replace(/"/g, "\\u0022");
  return htmlString.replace(/{{postEvent}}/g, safe);
}

// Build complete HTML document
export function buildHtmlDocument({
  title,
  favicon,
  cssString,
  htmlString,
  instanceId,
  webhookId,
  client,
}) {
  const defaultFavicon =
    "https://static.wixstatic.com/media/262d77_e526592fe4ad489f8ca37e0bc2f8b53b%7Emv2.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/262d77_e526592fe4ad489f8ca37e0bc2f8b53b%7Emv2.png";

  const instanceMeta =
    instanceId && webhookId
      ? `
    <meta name="tgl-instance-id" content="${instanceId}">
    <meta name="tgl-webhook-id" content="${webhookId}">
    ${client ? `<meta name="tgl-client-id" content="${client.id}">` : ""}
    <script>
      // Create InstanceMeta object for easy access
      var InstanceMeta = {
        instanceId: ${JSON.stringify(instanceId)},
        webhookId: ${JSON.stringify(webhookId)},
        client: ${JSON.stringify(client || null)}
      };
      
      // Make InstanceMeta properties directly accessible
      var instanceId = InstanceMeta.instanceId;
      var webhookId = InstanceMeta.webhookId;
      var client = InstanceMeta.client;
    </script>
  `
      : "";

  return `<!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <link rel="icon" href=${
                  favicon || defaultFavicon
                } sizes="32x32">
                ${instanceMeta}
                <style>${cssString}</style>
              </head>
              <body>${htmlString}</body>
              </html>`;
}
