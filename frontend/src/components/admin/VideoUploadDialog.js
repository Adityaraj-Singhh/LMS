import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField, 
  LinearProgress, 
  Alert,
  Autocomplete,
  Typography,
  Box,
  Chip
} from '@mui/material';
import { getCourses } from '../../api/courseApi';
import { getUnitsByCourse } from '../../api/unitApi';
import { getContentChangeImpactAnalysis } from '../../api/unitValidationApi';

const ContentUploadDialog = ({ open, onClose, onUpload }) => {
  const [form, setForm] = useState({ title: '', description: '', courseId: '', unitId: '' });
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'video' or 'document'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [showImpactWarning, setShowImpactWarning] = useState(false);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (open) {
      fetchCourses();
    }
  }, [open]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const courseData = await getCourses(token);
      setCourses(courseData);
    } catch (err) {
      setError('Failed to load courses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to determine file type
  const getFileType = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp'];
    const documentExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    
    if (file.type.startsWith('video/') || videoExts.includes(ext)) {
      return 'video';
    } else if (file.type.startsWith('application/') || file.type.startsWith('text/') || documentExts.includes(ext)) {
      return 'document';
    }
    return null;
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  
  const handleFileChange = e => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const detectedType = getFileType(selectedFile);
      setFileType(detectedType);
      
      if (detectedType === 'video') {
        // Extract video duration for videos
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = function() {
          window.URL.revokeObjectURL(video.src);
          const duration = Math.round(video.duration);
          console.log('Video duration extracted:', duration, 'seconds');
          
          // Store duration with the file
          selectedFile.videoDuration = duration;
          setFile(selectedFile);
        };
        
        video.onerror = function() {
          console.warn('Could not extract video duration');
          // Still allow upload without duration
          setFile(selectedFile);
        };
        
        video.src = URL.createObjectURL(selectedFile);
      } else if (detectedType === 'document') {
        // For documents, just set the file
        setFile(selectedFile);
      } else {
        setError('Unsupported file type. Please select a video or document file.');
        setFile(null);
        setFileType(null);
      }
    }
  };

  const handleDrop = e => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Simulate file input change
      const event = { target: { files: [droppedFile] } };
      handleFileChange(event);
    }
  };

  const handleCourseChange = async (event, value) => {
    setSelectedCourse(value);
    setSelectedUnit(null);
    setUnits([]);
    
    if (value) {
      setForm({ ...form, courseId: value._id, unitId: '' });
      
      // Fetch units for the selected course
      setLoadingUnits(true);
      try {
        const unitsData = await getUnitsByCourse(value._id, token);
        setUnits(unitsData);
      } catch (err) {
        console.error('Error fetching units:', err);
      } finally {
        setLoadingUnits(false);
      }
    } else {
      setForm({ ...form, courseId: '', unitId: '' });
    }
  };
  
  const handleUnitChange = async (event, value) => {
    setSelectedUnit(value);
    setImpactAnalysis(null);
    setShowImpactWarning(false);
    
    if (value) {
      setForm({ ...form, unitId: value._id });
      
      // Check impact for launched courses
      if (selectedCourse?.isLaunched) {
        try {
          const impact = await getContentChangeImpactAnalysis(selectedCourse._id, value._id, token);
          setImpactAnalysis(impact);
          setShowImpactWarning(impact.studentsAffected > 0);
        } catch (err) {
          console.error('Error getting impact analysis:', err);
        }
      }
    } else {
      setForm({ ...form, unitId: '' });
    }
  };

  const handleUpload = async () => {
    setError('');
    if (!file || !form.title || !form.courseId) return setError('Title, course, and file are required');
    
    // Check if units are available but none selected
    if (units.length > 0 && !form.unitId) {
      return setError('Please select a unit');
    }
    
    try {
      await onUpload({ ...form, file }, setProgress);
      setForm({ title: '', description: '', courseId: '', unitId: '' });
      setSelectedCourse(null);
      setSelectedUnit(null);
      setUnits([]);
      setFile(null);
      setFileType(null);
      setProgress(0);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed');
    }
  };

  const getFileTypeColor = (type) => {
    switch (type) {
      case 'video': return 'primary';
      case 'document': return 'success';
      default: return 'default';
    }
  };

  const getFileTypeLabel = (type) => {
    switch (type) {
      case 'video': return 'Video File';
      case 'document': return 'Document';
      default: return 'Unknown';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Content</DialogTitle>
      <DialogContent onDrop={handleDrop} onDragOver={e => e.preventDefault()} sx={{ minWidth: 350 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField 
          label="Title" 
          name="title" 
          value={form.title} 
          onChange={handleChange} 
          fullWidth 
          margin="normal" 
          required 
        />
        <TextField 
          label="Description" 
          name="description" 
          value={form.description} 
          onChange={handleChange} 
          fullWidth 
          margin="normal" 
          multiline 
          rows={3}
        />
        
        <Autocomplete
          options={courses}
          getOptionLabel={(option) => `${option.courseCode || ''} - ${option.title}`}
          value={selectedCourse}
          onChange={handleCourseChange}
          loading={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select Course"
              margin="normal"
              required
              fullWidth
              placeholder="Search by course code or title"
            />
          )}
          renderOption={(props, option) => (
            <li {...props}>
              <Box>
                <Typography variant="body1" fontWeight="medium" color="primary">
                  {option.courseCode || 'No Code'} - {option.title}
                </Typography>
                {option.description && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {option.description.substring(0, 60)}
                    {option.description.length > 60 ? '...' : ''}
                  </Typography>
                )}
              </Box>
            </li>
          )}
          noOptionsText={loading ? "Loading courses..." : "No courses found"}
        />
        
        {selectedCourse && (
          <Autocomplete
            options={units}
            getOptionLabel={(option) => option.title}
            value={selectedUnit}
            onChange={handleUnitChange}
            loading={loadingUnits}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select Unit"
                margin="normal"
                required
                error={!form.unitId && units.length > 0}
                helperText={!form.unitId && units.length > 0 ? "Unit selection is required" : ""}
                fullWidth
                placeholder={units.length === 0 ? "No units available" : "Search for unit"}
              />
            )}
            renderOption={(props, option) => (
              <li {...props}>
                <Box>
                  <Typography variant="body1">
                    {option.title}
                  </Typography>
                  {option.description && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {option.description.substring(0, 60)}
                      {option.description.length > 60 ? '...' : ''}
                    </Typography>
                  )}
                </Box>
              </li>
            )}
            noOptionsText={loadingUnits ? "Loading units..." : "No units available"}
          />
        )}
        
        {/* Impact Warning for Launched Courses */}
        {showImpactWarning && impactAnalysis && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body1" fontWeight="medium" gutterBottom>
              ⚠️ Student Progress Impact Warning
            </Typography>
            <Typography variant="body2" gutterBottom>
              This course is already launched with students enrolled. Adding new content will affect:
            </Typography>
            <Box component="ul" sx={{ ml: 2, mb: 1 }}>
              <li><strong>{impactAnalysis.studentsAffected}</strong> students will need to complete new content</li>
              <li><strong>{impactAnalysis.progressionBlocked}</strong> students may have their progression temporarily blocked</li>
              <li>Students must complete new content before accessing subsequent units</li>
            </Box>
            <Typography variant="body2" color="text.secondary">
              New content will trigger the CC re-arrangement workflow for HOD approval.
            </Typography>
          </Alert>
        )}
        
        <Box sx={{ mt: 3, mb: 1 }}>
          <input 
            type="file" 
            accept="video/*,.pdf,.doc,.docx,.txt,.rtf,.odt" 
            onChange={handleFileChange} 
            style={{ width: '100%' }} 
          />
        </Box>
        
        {file && (
          <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                Selected: <strong>{file.name}</strong> ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </Typography>
              {fileType && (
                <Chip 
                  size="small" 
                  label={getFileTypeLabel(fileType)} 
                  color={getFileTypeColor(fileType)}
                />
              )}
            </Box>
          </Box>
        )}
        
        {progress > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" align="center" gutterBottom>
              Uploading: {progress.toFixed(0)}%
            </Typography>
            <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 2 }} />
          </Box>
        )}
        
        <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1, border: '1px dashed #ccc' }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Or drag and drop a video or document file here
          </Typography>
          <Typography variant="caption" color="text.secondary" align="center" display="block" sx={{ mt: 1 }}>
            Supported: Videos (MP4, AVI, MOV...) and Documents (PDF, DOC, DOCX...)
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleUpload} 
          variant="contained" 
          disabled={!file || !form.title || !form.courseId || (units.length > 0 && !form.unitId) || progress > 0}
        >
          Upload {fileType ? getFileTypeLabel(fileType) : 'Content'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContentUploadDialog;
