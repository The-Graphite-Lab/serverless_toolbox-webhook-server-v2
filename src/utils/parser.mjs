// utils/parser.mjs - Form data parsing utilities

// Parse multipart or JSON body
export function parseFormData(body) {
  if (!body.includes("Content-Disposition")) return JSON.parse(body);

  const boundary = body.slice(0, body.indexOf("\r\n"));
  const parts = body
    .split(boundary)
    .filter((p) => p.trim() !== "" && p.trim() !== "--");
  const parsed = { files: [] };

  parts.forEach((part) => {
    const [header, value] = part.split("\r\n\r\n");
    const nameMatch = header?.match(/name="([^"]+)"/);
    if (!nameMatch) return;
    const name = nameMatch[1];
    if (header.includes("filename")) {
      const contentType = header.match(/Content-Type: ([^;]+)/)[1];
      let content = value.trim().replace(/\r\n$/, "");
      if (content.startsWith("data:") && content.includes("base64,")) {
        content = Buffer.from(content.split("base64,")[1], "base64");
      } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
        content = Buffer.from(content, "base64");
      } else {
        content = Buffer.from(content, "binary");
      }
      parsed.files.push({
        filename: header.match(/filename="([^"]+)"/)[1],
        contentType,
        content,
      });
    } else {
      const cleaned = value.trim().replace(/\r\n$/, "");
      if (cleaned.startsWith("data:image/") && cleaned.includes("base64,")) {
        const contentType = cleaned.match(/data:([^;]+);base64,/)[1];
        const base64Content = cleaned.split("base64,")[1];
        const bufferContent = Buffer.from(base64Content, "base64");
        const extension = contentType.split("/")[1];
        const filename = `${name}.${extension}`;
        parsed.files.push({ filename, contentType, content: bufferContent });
      } else {
        parsed[name] = cleaned;
      }
    }
  });

  return parsed;
}
