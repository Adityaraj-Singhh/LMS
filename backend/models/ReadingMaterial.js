const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReadingMaterialSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  unit: {
    type: Schema.Types.ObjectId,
    ref: 'Unit',
    required: true
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  contentType: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'text', 'link', 'document'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String
  },
  order: {
    type: Number,
    default: 0
  },
  
  // Content approval workflow fields
  isApproved: {
    type: Boolean,
    default: true  // For new courses, content is auto-approved
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  addedAfterLaunch: {
    type: Boolean,
    default: false  // Track if added after course launch
  },
  
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

module.exports = mongoose.model('ReadingMaterial', ReadingMaterialSchema);
