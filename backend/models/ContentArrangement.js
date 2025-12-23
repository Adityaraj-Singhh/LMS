const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContentItemSchema = new Schema({
  type: {
    type: String,
    enum: ['video', 'document'],
    required: true
  },
  contentId: {
    type: Schema.Types.ObjectId,
    required: true
    // Note: No refPath here since we'll handle population manually
  },
  title: {
    type: String,
    required: true
  },
  unitId: {
    type: Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  originalUnitId: {
    type: Schema.Types.ObjectId,
    ref: 'Unit'
  },
  originalOrder: {
    type: Number
  }
}, { _id: false });

const ContentArrangementSchema = new Schema({
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  coordinator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'submitted', 'approved', 'rejected'],
    default: 'open'
  },
  items: [ContentItemSchema],
  submittedAt: {
    type: Date
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String
  },
  comments: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  version: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for efficient queries
ContentArrangementSchema.index({ course: 1, status: 1 });
ContentArrangementSchema.index({ coordinator: 1, status: 1 });
ContentArrangementSchema.index({ course: 1, version: -1 });

module.exports = mongoose.model('ContentArrangement', ContentArrangementSchema);