import "server-only";
import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/** Re-host an image from a remote URL onto Cloudinary. Returns the new URL, or
 *  null if Cloudinary couldn't fetch it (some source CDNs block fetchers). */
export async function uploadFromUrl(remoteUrl: string): Promise<string | null> {
  if (!isCloudinaryConfigured) return null;
  try {
    const res = await cloudinary.uploader.upload(remoteUrl, {
      folder: "yeehaw/sources",
      resource_type: "image",
      timeout: 60000,
    });
    return res.secure_url;
  } catch {
    return null;
  }
}

/** Upload an image buffer to Cloudinary under the yeehaw/ folder. Returns the URL. */
export async function uploadImage(
  buffer: Buffer,
  filename?: string
): Promise<{ url: string; width?: number; height?: number }> {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary is not configured. Add CLOUDINARY_* to .env.local.");
  }
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "yeehaw",
          resource_type: "image",
          timeout: 60000,
          // light auto-optimization; originals stay retrievable
          use_filename: Boolean(filename),
          filename_override: filename,
          unique_filename: true,
        },
        (err, result) => {
          if (err || !result) return reject(err ?? new Error("upload failed"));
          resolve({ url: result.secure_url, width: result.width, height: result.height });
        }
      )
      .end(buffer);
  });
}
