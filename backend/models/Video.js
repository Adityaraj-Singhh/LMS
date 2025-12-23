const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  contentBlock: { type: mongoose.Schema.Types.ObjectId, ref: 'ContentBlock' },
  sequence: { type: Number, default: 1 }, // Sequence within unit or content block
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  videoUrl: { type: String }, // Legacy field - no longer required (using hlsUrl)
  duration: { type: Number }, // Duration in seconds
  resourceFiles: [{ type: String }],
  warned: { type: Boolean, default: false },
  
  // Bunny Stream fields
  bunnyVideoId: { type: String }, // Bunny Stream video GUID
  bunnyLibraryId: { type: String, default: '567095' }, // Bunny library ID
  transcodingStatus: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  availableResolutions: [{ type: Number }], // [240, 360, 480, 720]
  hlsUrl: { type: String }, // HLS manifest URL for streaming
  thumbnailUrl: { type: String }, // Auto-generated thumbnail
  defaultQuality: { type: Number, default: 360 }, // Default playback quality
  
  // Content approval workflow fields
  isApproved: { type: Boolean, default: true }, // For new courses, content is auto-approved
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  addedAfterLaunch: { type: Boolean, default: false }, // Track if added after course launch
  watchRecords: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timeSpent: { type: Number, default: 0 },
    lastWatched: { type: Date },
    completed: { type: Boolean, default: false }
  }],
  analytics: {
    totalViews: { type: Number, default: 0 },
    totalWatchTime: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    lastUpdated: { type: Date }
  },
  // To mark which video should have a quiz after it
  hasQuizAfter: { type: Boolean, default: false },
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }
}, { timestamps: true });

// Create indexes for common queries
videoSchema.index({ course: 1 });
videoSchema.index({ unit: 1 });
videoSchema.index({ teacher: 1 });

// Add a pre-save middleware to ensure sequence is set
videoSchema.pre('save', async function(next) {
  // If this is a new video and sequence isn't explicitly set
  if (this.isNew && this.sequence === 1) {
    try {
      let maxSequence = 1;
      
      // If this video belongs to a unit, find the highest sequence in that unit
      if (this.unit) {
        const Video = mongoose.model('Video');
        const videos = await Video.find({ unit: this.unit })
          .sort('-sequence')
          .limit(1);
          
        if (videos.length > 0) {
          maxSequence = videos[0].sequence + 1;
        }
      } else if (this.course) {
        // Otherwise, find the highest sequence in the course
        const Video = mongoose.model('Video');
        const videos = await Video.find({ 
          course: this.course,
          unit: { $exists: false }
        })
        .sort('-sequence')
        .limit(1);
        
        if (videos.length > 0) {
          maxSequence = videos[0].sequence + 1;
        }
      }
      
      this.sequence = maxSequence;
    } catch (err) {
      console.error('Error setting video sequence:', err);
    }
  }
  
  next();
});

// Virtual to check if video is from Bunny Stream
videoSchema.virtual('isBunnyVideo').get(function() {
  return !!this.bunnyVideoId;
});

// Virtual to check if video is ready for playback
videoSchema.virtual('isReady').get(function() {
  if (this.bunnyVideoId) {
    return this.transcodingStatus === 'completed';
  }
  return !!this.videoUrl;
});

// Method to get streaming URL
videoSchema.methods.getStreamingUrl = function() {
  if (this.bunnyVideoId && this.hlsUrl) {
    return this.hlsUrl;
  }
  return this.videoUrl;
};

// Ensure virtuals are included in JSON output
videoSchema.set('toJSON', { virtuals: true });
videoSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Video', videoSchema);
