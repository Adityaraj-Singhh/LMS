const axios = require('axios');
const cacheService = require('./cacheService');
const crypto = require('crypto');

/**
 * Bunny Stream Service
 * Handles video upload, streaming, and CDN URL generation for Bunny.net Stream
 * 
 * Configuration:
 * - Library ID: 567095
 * - CDN Hostname: vz-6b31636e-f82.b-cdn.net
 * - Max Resolution: 720p
 * - Default Quality: 360p
 */
class BunnyStreamService {
  constructor() {
    this.apiKey = process.env.BUNNY_STREAM_API_KEY || 'e8bb584d-2f33-4e3f-ac5c52298c8e-4089-4fd6';
    this.libraryId = process.env.BUNNY_LIBRARY_ID || '567095';
    this.cdnHostname = process.env.BUNNY_CDN_HOSTNAME || 'vz-6b31636e-f82.b-cdn.net';
    this.apiBaseUrl = `https://video.bunnycdn.com/library/${this.libraryId}`;
    
    // Available resolutions (max 720p as per requirement)
    this.availableResolutions = [240, 360, 480, 720];
    this.defaultResolution = 360;
    
    console.log('🐰 BunnyStreamService initialized');
    console.log(`   Library ID: ${this.libraryId}`);
    console.log(`   CDN Hostname: ${this.cdnHostname}`);
    console.log(`   Max Resolution: 720p`);
    console.log(`   Default Resolution: ${this.defaultResolution}p`);
  }

  /**
   * Create a new video entry in Bunny Stream
   * This returns upload credentials for TUS upload
   * @param {string} title - Video title
   * @param {string} collectionId - Optional collection ID
   * @returns {Promise<Object>} - Video creation response with GUID and upload URL
   */
  async createVideo(title, collectionId = null) {
    try {
      const payload = {
        title: title
      };
      
      if (collectionId) {
        payload.collectionId = collectionId;
      }

      const response = await axios.post(
        `${this.apiBaseUrl}/videos`,
        payload,
        {
          headers: {
            'AccessKey': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log(`✅ Created Bunny video entry: ${response.data.guid}`);
      
      return {
        videoId: response.data.guid,
        libraryId: this.libraryId,
        title: response.data.title,
        uploadUrl: `https://video.bunnycdn.com/tusupload`,
        authorizationSignature: this.generateTusSignature(response.data.guid),
        authorizationExpire: Math.floor(Date.now() / 1000) + 7200, // 2 hours
        status: response.data.status,
        raw: response.data
      };
    } catch (error) {
      console.error('❌ Error creating Bunny video:', error.response?.data || error.message);
      throw new Error(`Failed to create video in Bunny Stream: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate TUS upload signature for direct upload
   * @param {string} videoId - Bunny video GUID
   * @returns {string} - SHA256 signature
   */
  generateTusSignature(videoId) {
    const expirationTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    const signatureString = `${this.libraryId}${this.apiKey}${expirationTime}${videoId}`;
    return crypto.createHash('sha256').update(signatureString).digest('hex');
  }

  /**
   * Upload video directly to Bunny Stream using fetch API
   * For server-side uploads (not TUS)
   * @param {string} videoId - Bunny video GUID
   * @param {Buffer|Stream} fileBuffer - Video file buffer or stream
   * @returns {Promise<Object>} - Upload response
   */
  async uploadVideoBuffer(videoId, fileBuffer) {
    try {
      const response = await axios.put(
        `${this.apiBaseUrl}/videos/${videoId}`,
        fileBuffer,
        {
          headers: {
            'AccessKey': this.apiKey,
            'Content-Type': 'application/octet-stream'
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 0 // No timeout for large uploads
        }
      );

      console.log(`✅ Uploaded video buffer to Bunny: ${videoId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error uploading video buffer:', error.response?.data || error.message);
      throw new Error(`Failed to upload video to Bunny Stream: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get video details from Bunny Stream
   * @param {string} videoId - Bunny video GUID
   * @returns {Promise<Object>} - Video details including transcoding status
   */
  async getVideoDetails(videoId) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/videos/${videoId}`,
        {
          headers: {
            'AccessKey': this.apiKey,
            'Accept': 'application/json'
          }
        }
      );

      const video = response.data;
      
      // Map Bunny status to our transcoding status
      let transcodingStatus = 'pending';
      if (video.status === 4) {
        transcodingStatus = 'completed';
      } else if (video.status === 3) {
        transcodingStatus = 'processing';
      } else if (video.status === 5 || video.status === 6) {
        transcodingStatus = 'failed';
      }

      // Get available resolutions from Bunny (filter to max 720p)
      const availableResolutions = [];
      if (video.availableResolutions) {
        const resolutions = video.availableResolutions.split(',').map(r => parseInt(r));
        resolutions.forEach(res => {
          if (res <= 720 && this.availableResolutions.includes(res)) {
            availableResolutions.push(res);
          }
        });
      }

      return {
        videoId: video.guid,
        title: video.title,
        duration: video.length, // Duration in seconds
        status: video.status,
        transcodingStatus,
        availableResolutions: availableResolutions.length > 0 ? availableResolutions : [360],
        thumbnailUrl: video.thumbnailFileName 
          ? `https://${this.cdnHostname}/${videoId}/${video.thumbnailFileName}`
          : null,
        hlsUrl: `https://${this.cdnHostname}/${videoId}/playlist.m3u8`,
        directPlayUrl: `https://${this.cdnHostname}/${videoId}/play_720p.mp4`,
        width: video.width,
        height: video.height,
        size: video.storageSize,
        views: video.views,
        dateUploaded: video.dateUploaded,
        isReady: video.status === 4, // Status 4 = Finished
        raw: video
      };
    } catch (error) {
      console.error('❌ Error getting video details:', error.response?.data || error.message);
      throw new Error(`Failed to get video details: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Poll for video transcoding completion
   * @param {string} videoId - Bunny video GUID
   * @param {number} maxAttempts - Maximum polling attempts
   * @param {number} intervalMs - Polling interval in milliseconds
   * @returns {Promise<Object>} - Final video details
   */
  async waitForTranscoding(videoId, maxAttempts = 60, intervalMs = 5000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const details = await this.getVideoDetails(videoId);
      
      if (details.transcodingStatus === 'completed') {
        console.log(`✅ Video ${videoId} transcoding completed`);
        return details;
      }
      
      if (details.transcodingStatus === 'failed') {
        throw new Error(`Video transcoding failed for ${videoId}`);
      }
      
      console.log(`⏳ Video ${videoId} transcoding in progress... (attempt ${attempt + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Video transcoding timeout for ${videoId}`);
  }

  /**
   * Delete a video from Bunny Stream
   * @param {string} videoId - Bunny video GUID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteVideo(videoId) {
    try {
      await axios.delete(
        `${this.apiBaseUrl}/videos/${videoId}`,
        {
          headers: {
            'AccessKey': this.apiKey
          }
        }
      );

      console.log(`✅ Deleted video from Bunny: ${videoId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting video:', error.response?.data || error.message);
      throw new Error(`Failed to delete video: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate HLS streaming URL for a video
   * @param {string} videoId - Bunny video GUID
   * @returns {string} - HLS playlist URL
   */
  getHlsUrl(videoId) {
    return `https://${this.cdnHostname}/${videoId}/playlist.m3u8`;
  }

  /**
   * Generate direct MP4 URL for specific resolution
   * @param {string} videoId - Bunny video GUID
   * @param {number} resolution - Resolution (240, 360, 480, 720)
   * @returns {string} - Direct MP4 URL
   */
  getDirectUrl(videoId, resolution = 360) {
    // Ensure resolution is within our allowed range
    const validResolution = Math.min(resolution, 720);
    return `https://${this.cdnHostname}/${videoId}/play_${validResolution}p.mp4`;
  }

  /**
   * Generate thumbnail URL for a video
   * @param {string} videoId - Bunny video GUID
   * @returns {string} - Thumbnail URL
   */
  getThumbnailUrl(videoId) {
    return `https://${this.cdnHostname}/${videoId}/thumbnail.jpg`;
  }

  /**
   * Get signed/secured URL with token authentication (optional security)
   * For now, we use direct CDN URLs as Bunny Stream URLs are not publicly listable
   * @param {string} videoId - Bunny video GUID
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} - CDN URL (with optional token)
   */
  async getSignedUrl(videoId, expiresIn = 3600) {
    try {
      const cacheKey = `bunny:signed:${videoId}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log(`📦 Returning cached Bunny URL for: ${videoId}`);
        return cached;
      }

      // Generate HLS URL (Bunny Stream doesn't require signed URLs for private libraries)
      const hlsUrl = this.getHlsUrl(videoId);
      
      // Cache the URL (55 minutes if URL conceptually expires in 60)
      const cacheTtl = Math.max(60, expiresIn - 300);
      await cacheService.set(cacheKey, hlsUrl, cacheTtl);
      
      console.log(`✅ Generated Bunny streaming URL for: ${videoId}`);
      return hlsUrl;
    } catch (error) {
      console.error('❌ Error generating Bunny URL:', error);
      // Fallback to non-cached URL
      return this.getHlsUrl(videoId);
    }
  }

  /**
   * Get video streaming info for frontend player
   * Returns all necessary URLs and metadata for the video player
   * @param {string} videoId - Bunny video GUID
   * @returns {Promise<Object>} - Streaming info object
   */
  async getStreamingInfo(videoId) {
    try {
      // Try to get video details for accurate resolution info
      let videoDetails = null;
      try {
        videoDetails = await this.getVideoDetails(videoId);
      } catch (e) {
        console.warn('Could not fetch video details, using defaults');
      }

      const availableResolutions = videoDetails?.availableResolutions || this.availableResolutions;
      
      return {
        videoId,
        hlsUrl: this.getHlsUrl(videoId),
        thumbnailUrl: this.getThumbnailUrl(videoId),
        availableResolutions: availableResolutions.filter(r => r <= 720),
        defaultResolution: this.defaultResolution,
        maxResolution: 720,
        directUrls: {
          '240p': this.getDirectUrl(videoId, 240),
          '360p': this.getDirectUrl(videoId, 360),
          '480p': this.getDirectUrl(videoId, 480),
          '720p': this.getDirectUrl(videoId, 720)
        },
        isReady: videoDetails?.isReady ?? true,
        transcodingStatus: videoDetails?.transcodingStatus ?? 'completed',
        duration: videoDetails?.duration ?? null
      };
    } catch (error) {
      console.error('❌ Error getting streaming info:', error);
      // Return minimal info on error
      return {
        videoId,
        hlsUrl: this.getHlsUrl(videoId),
        thumbnailUrl: this.getThumbnailUrl(videoId),
        availableResolutions: [360],
        defaultResolution: 360,
        maxResolution: 720,
        directUrls: {
          '360p': this.getDirectUrl(videoId, 360)
        },
        isReady: true,
        transcodingStatus: 'unknown'
      };
    }
  }

  /**
   * List all videos in the library
   * @param {number} page - Page number
   * @param {number} itemsPerPage - Items per page
   * @returns {Promise<Object>} - List of videos
   */
  async listVideos(page = 1, itemsPerPage = 100) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/videos`,
        {
          params: {
            page,
            itemsPerPage
          },
          headers: {
            'AccessKey': this.apiKey,
            'Accept': 'application/json'
          }
        }
      );

      return {
        videos: response.data.items,
        totalItems: response.data.totalItems,
        currentPage: response.data.currentPage,
        itemsPerPage: response.data.itemsPerPage
      };
    } catch (error) {
      console.error('❌ Error listing videos:', error.response?.data || error.message);
      throw new Error(`Failed to list videos: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check if a video ID is a Bunny video GUID format
   * Bunny GUIDs are UUIDs like: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   * @param {string} videoId - Video ID to check
   * @returns {boolean} - True if it's a Bunny GUID
   */
  isBunnyVideoId(videoId) {
    if (!videoId) return false;
    // Bunny video GUIDs are standard UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(videoId);
  }

  /**
   * Extract Bunny video ID from various URL formats
   * @param {string} url - URL that might contain a Bunny video ID
   * @returns {string|null} - Bunny video ID or null
   */
  extractVideoIdFromUrl(url) {
    if (!url) return null;
    
    // Check if the URL contains our CDN hostname
    if (url.includes(this.cdnHostname) || url.includes('b-cdn.net')) {
      // Extract GUID from URL like: https://vz-xxx.b-cdn.net/GUID/playlist.m3u8
      const matches = url.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (matches) {
        return matches[1];
      }
    }
    
    return null;
  }
}

// Export singleton instance
module.exports = new BunnyStreamService();
