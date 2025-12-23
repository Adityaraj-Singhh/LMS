const ftp = require('basic-ftp');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

/**
 * Bunny Storage Service
 * Handles document uploads to Bunny.net Storage via FTP
 * 
 * Configuration:
 * - Storage Zone: lms-document-storage
 * - Hostname: sg.storage.bunnycdn.com
 * - CDN URL: https://lms-document-storage.b-cdn.net
 */
class BunnyStorageService {
  constructor() {
    this.hostname = process.env.BUNNY_STORAGE_HOST || 'sg.storage.bunnycdn.com';
    this.username = process.env.BUNNY_STORAGE_USERNAME || 'lms-document-storage';
    this.password = process.env.BUNNY_STORAGE_PASSWORD || 'd3fe18a7-89bb-43a8-9297c4dc3105-d995-43af';
    this.cdnUrl = process.env.BUNNY_STORAGE_CDN_URL || 'https://lms-document-storage.b-cdn.net';
    this.port = 21;
    
    console.log('🐰 BunnyStorageService initialized');
    console.log(`   Storage Zone: ${this.username}`);
    console.log(`   CDN URL: ${this.cdnUrl}`);
  }

  /**
   * Generate a unique filename
   * @param {string} originalFilename 
   * @returns {string}
   */
  generateFilename(originalFilename) {
    const ext = path.extname(originalFilename);
    const basename = path.basename(originalFilename, ext);
    const hash = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    // Sanitize filename
    const cleanBasename = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${timestamp}-${hash}-${cleanBasename}${ext}`;
  }

  /**
   * Upload a document to Bunny Storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} originalFilename - Original filename
   * @param {string} folder - Folder path (e.g., 'reading-materials')
   * @returns {Promise<Object>} - Upload result with CDN URL
   */
  async uploadDocument(fileBuffer, originalFilename, folder = 'reading-materials') {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    
    try {
      console.log(`📤 Uploading to Bunny Storage: ${originalFilename}`);
      
      // Connect to FTP server
      await client.access({
        host: this.hostname,
        port: this.port,
        user: this.username,
        password: this.password,
        secure: false
      });

      // Generate unique filename
      const filename = this.generateFilename(originalFilename);
      const remotePath = `/${folder}/${filename}`;
      
      // Create folder if it doesn't exist
      try {
        await client.ensureDir(`/${folder}`);
      } catch (err) {
        // Folder might already exist, continue
      }
      
      // Convert Buffer to readable stream for FTP upload
      const bufferStream = Readable.from(fileBuffer);
      
      // Upload the file
      await client.uploadFrom(
        bufferStream,
        remotePath
      );
      
      client.close();
      
      const cdnUrl = `${this.cdnUrl}/${folder}/${filename}`;
      
      console.log(`✅ Document uploaded successfully: ${cdnUrl}`);
      
      return {
        success: true,
        cdnUrl: cdnUrl,
        filename: filename,
        folder: folder,
        size: fileBuffer.length
      };
      
    } catch (error) {
      client.close();
      console.error('❌ Bunny Storage upload failed:', error);
      throw new Error(`Failed to upload to Bunny Storage: ${error.message}`);
    }
  }

  /**
   * Delete a document from Bunny Storage
   * @param {string} cdnUrl - Full CDN URL or relative path
   * @returns {Promise<boolean>}
   */
  async deleteDocument(cdnUrl) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    
    try {
      // Extract path from CDN URL
      let remotePath;
      if (cdnUrl.startsWith('http')) {
        const url = new URL(cdnUrl);
        remotePath = url.pathname;
      } else {
        remotePath = cdnUrl.startsWith('/') ? cdnUrl : `/${cdnUrl}`;
      }
      
      console.log(`🗑️ Deleting from Bunny Storage: ${remotePath}`);
      
      // Connect to FTP server
      await client.access({
        host: this.hostname,
        port: this.port,
        user: this.username,
        password: this.password,
        secure: false
      });
      
      // Delete the file
      await client.remove(remotePath);
      
      client.close();
      
      console.log(`✅ Document deleted successfully`);
      return true;
      
    } catch (error) {
      client.close();
      console.error('❌ Bunny Storage delete failed:', error);
      return false;
    }
  }

  /**
   * Get signed URL for secure document access
   * Bunny CDN supports token authentication
   * @param {string} cdnUrl - CDN URL
   * @param {number} expiresIn - Expiration time in seconds (default 3600)
   * @returns {string} - Signed URL
   */
  getSignedUrl(cdnUrl, expiresIn = 3600) {
    // For now, return the CDN URL directly
    // Token authentication can be added later if needed
    return cdnUrl;
  }

  /**
   * Get CDN URL from filename and folder
   * @param {string} filename 
   * @param {string} folder 
   * @returns {string}
   */
  getCdnUrl(filename, folder = 'reading-materials') {
    return `${this.cdnUrl}/${folder}/${filename}`;
  }
}

module.exports = new BunnyStorageService();
