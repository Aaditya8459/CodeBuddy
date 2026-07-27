// lib/generateRoomCode.ts
import crypto from "crypto";

export function generateRoomCode(length: number = 8): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const bytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += characters[bytes[i] % characters.length];
  }

  return result;
}