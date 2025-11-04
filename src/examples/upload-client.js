// Example client code for uploading files using authenticated S3 URLs

/**
 * Example of how to use the authenticated upload URL endpoint
 *
 * Prerequisites:
 * 1. User must be authenticated (have the JWT cookie)
 * 2. Cookie must be included in the request
 */

// Step 1: Request an upload URL from your webhook server
async function getUploadUrl(instanceId, filename, contentType, fileSize) {
  const response = await fetch(
    `https://your-api-domain.com/instances/${instanceId}/upload-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // If CSRF protection is enabled, include these:
        "X-Requested-With": "XMLHttpRequest",
        // Origin header is automatically included by browser
      },
      credentials: "include", // Important: includes cookies
      body: JSON.stringify({
        filename: filename,
        contentType: contentType,
        // Optional: include file size for validation
        contentLength: fileSize,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get upload URL");
  }

  return await response.json();
}

// Step 2: Upload the file directly to S3 using the presigned URL
async function uploadToS3(uploadInfo, file) {
  const response = await fetch(uploadInfo.uploadUrl, {
    method: uploadInfo.method || "PUT",
    headers: uploadInfo.headers,
    body: file,
  });

  if (!response.ok) {
    throw new Error("Failed to upload file to S3");
  }

  return {
    fileKey: uploadInfo.fileKey,
    bucket: uploadInfo.bucket,
  };
}

// Step 3: (Optional) Notify the server that upload is complete
async function notifyUploadComplete(instanceId, fileKey, fileSize) {
  const response = await fetch(
    `https://your-api-domain.com/instances/${instanceId}/upload-complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
      body: JSON.stringify({
        fileKey: fileKey,
        size: fileSize,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to confirm upload");
  }

  return await response.json();
}

// Complete example: Upload a file
async function uploadFile(instanceId, file) {
  try {
    // Step 1: Get upload URL
    const uploadInfo = await getUploadUrl(
      instanceId,
      file.name,
      file.type || "application/octet-stream",
      file.size
    );

    // Step 2: Upload to S3
    const s3Result = await uploadToS3(uploadInfo, file);

    // Step 3: Confirm upload (optional)
    const confirmation = await notifyUploadComplete(
      instanceId,
      s3Result.fileKey,
      file.size
    );

    return {
      success: true,
      fileKey: s3Result.fileKey,
      s3Url: confirmation.s3Url,
    };
  } catch (error) {
    // Upload failed
    throw error;
  }
}

// Example usage with a file input
document
  .getElementById("fileInput")
  .addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const instanceId = "your-instance-id"; // Get this from your application context

    try {
      const result = await uploadFile(instanceId, file);
      // Upload successful

      // You can now use result.s3Url or result.fileKey to reference the uploaded file
      alert(`File uploaded successfully! Key: ${result.fileKey}`);
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  });

// Example: Upload a large file with progress tracking
async function uploadLargeFile(instanceId, file, onProgress) {
  // Get upload URL
  const uploadInfo = await getUploadUrl(
    instanceId,
    file.name,
    file.type,
    file.size
  );

  // Create XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = (event.loaded / event.total) * 100;
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 200 || xhr.status === 204) {
        // Upload successful, notify server
        try {
          const confirmation = await notifyUploadComplete(
            instanceId,
            uploadInfo.fileKey,
            file.size
          );
          resolve({
            success: true,
            fileKey: uploadInfo.fileKey,
            s3Url: confirmation.s3Url,
          });
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });

    xhr.open(uploadInfo.method || "PUT", uploadInfo.uploadUrl);

    // Set headers
    Object.entries(uploadInfo.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.send(file);
  });
}

// Example with progress bar
async function uploadWithProgress() {
  const fileInput = document.getElementById("fileInput");
  const progressBar = document.getElementById("progressBar");
  const file = fileInput.files[0];

  if (!file) return;

  try {
    const result = await uploadLargeFile(
      "your-instance-id",
      file,
      (progress) => {
        progressBar.value = progress;
        // Progress: ${progress.toFixed(2)}%
      }
    );

    // Upload complete
  } catch (error) {
    // Upload failed
  }
}
