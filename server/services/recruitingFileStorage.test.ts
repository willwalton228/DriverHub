import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateFileType,
  validateFileSize,
  antivirusScanHook,
  FILE_CONSTRAINTS,
} from "./recruitingFileStorage";

describe("Recruiting File Storage Hardening", () => {
  describe("File Type Validation", () => {
    it("should accept PDF files", () => {
      const result = validateFileType("application/pdf", "resume.pdf");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept JPEG files", () => {
      const result = validateFileType("image/jpeg", "license.jpg");
      expect(result.valid).toBe(true);
    });

    it("should accept JPEG files with .jpeg extension", () => {
      const result = validateFileType("image/jpeg", "photo.jpeg");
      expect(result.valid).toBe(true);
    });

    it("should accept PNG files", () => {
      const result = validateFileType("image/png", "id-card.png");
      expect(result.valid).toBe(true);
    });

    it("should accept DOCX files", () => {
      const result = validateFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cover-letter.docx"
      );
      expect(result.valid).toBe(true);
    });

    it("should reject executable files", () => {
      const result = validateFileType("application/x-executable", "malware.exe");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should reject HTML files", () => {
      const result = validateFileType("text/html", "page.html");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should reject SVG files", () => {
      const result = validateFileType("image/svg+xml", "vector.svg");
      expect(result.valid).toBe(false);
    });

    it("should reject ZIP files", () => {
      const result = validateFileType("application/zip", "archive.zip");
      expect(result.valid).toBe(false);
    });

    it("should reject mismatched mime type and extension", () => {
      const result = validateFileType("application/pdf", "document.png");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match");
    });

    it("should reject files with no extension", () => {
      const result = validateFileType("application/pdf", "noextension");
      expect(result.valid).toBe(false);
    });

    it("should handle case-insensitive mime types", () => {
      const result = validateFileType("APPLICATION/PDF", "doc.pdf");
      expect(result.valid).toBe(true);
    });

    it("should reject DOC (old Word format)", () => {
      const result = validateFileType("application/msword", "old-resume.doc");
      expect(result.valid).toBe(false);
    });

    it("should reject GIF images", () => {
      const result = validateFileType("image/gif", "animation.gif");
      expect(result.valid).toBe(false);
    });
  });

  describe("File Size Validation", () => {
    it("should accept small files", () => {
      const result = validateFileSize(1024); // 1KB
      expect(result.valid).toBe(true);
    });

    it("should accept files at exactly 25MB", () => {
      const result = validateFileSize(25 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it("should reject files over 25MB", () => {
      const result = validateFileSize(25 * 1024 * 1024 + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum");
    });

    it("should reject zero-byte files", () => {
      const result = validateFileSize(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    it("should reject negative file sizes", () => {
      const result = validateFileSize(-100);
      expect(result.valid).toBe(false);
    });

    it("should accept typical resume size (500KB)", () => {
      const result = validateFileSize(500 * 1024);
      expect(result.valid).toBe(true);
    });

    it("should accept 10MB files", () => {
      const result = validateFileSize(10 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });
  });

  describe("Antivirus Scan Hook", () => {
    it("should return clean status (stub)", async () => {
      const result = await antivirusScanHook(
        "recruiting/documents/app1/doc1/abc.pdf",
        "resume.pdf",
        "application/pdf"
      );
      expect(result.status).toBe("clean");
      expect(result.details).toContain("stub");
    });

    it("should accept any file type in stub mode", async () => {
      const result = await antivirusScanHook(
        "path/to/file.docx",
        "malicious.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(result.status).toBe("clean");
    });
  });

  describe("FILE_CONSTRAINTS export", () => {
    it("should expose allowed mime types", () => {
      expect(FILE_CONSTRAINTS.allowedMimeTypes).toContain("application/pdf");
      expect(FILE_CONSTRAINTS.allowedMimeTypes).toContain("image/jpeg");
      expect(FILE_CONSTRAINTS.allowedMimeTypes).toContain("image/png");
      expect(FILE_CONSTRAINTS.allowedMimeTypes).toContain(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(FILE_CONSTRAINTS.allowedMimeTypes.length).toBe(4);
    });

    it("should expose allowed extensions", () => {
      expect(FILE_CONSTRAINTS.allowedExtensions).toContain("pdf");
      expect(FILE_CONSTRAINTS.allowedExtensions).toContain("jpg");
      expect(FILE_CONSTRAINTS.allowedExtensions).toContain("jpeg");
      expect(FILE_CONSTRAINTS.allowedExtensions).toContain("png");
      expect(FILE_CONSTRAINTS.allowedExtensions).toContain("docx");
    });

    it("should expose max file size in bytes and MB", () => {
      expect(FILE_CONSTRAINTS.maxFileSizeBytes).toBe(25 * 1024 * 1024);
      expect(FILE_CONSTRAINTS.maxFileSizeMB).toBe(25);
    });

    it("should expose signed URL TTL", () => {
      expect(FILE_CONSTRAINTS.signedUrlTtlSeconds).toBe(900);
    });
  });

  describe("Combined Validation Scenarios", () => {
    it("should reject a valid type but oversized file", () => {
      const typeResult = validateFileType("application/pdf", "huge.pdf");
      expect(typeResult.valid).toBe(true);

      const sizeResult = validateFileSize(50 * 1024 * 1024);
      expect(sizeResult.valid).toBe(false);
    });

    it("should reject an invalid type but valid size file", () => {
      const typeResult = validateFileType("application/x-shellscript", "script.sh");
      expect(typeResult.valid).toBe(false);

      const sizeResult = validateFileSize(1024);
      expect(sizeResult.valid).toBe(true);
    });

    it("should accept a valid type and valid size file", () => {
      const typeResult = validateFileType("image/png", "screenshot.png");
      expect(typeResult.valid).toBe(true);

      const sizeResult = validateFileSize(2 * 1024 * 1024);
      expect(sizeResult.valid).toBe(true);
    });
  });
});
