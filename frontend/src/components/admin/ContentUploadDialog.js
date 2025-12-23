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

  const getFileTypeLabel = (type) => {
    switch(type) {
      case 'video': return 'Video';
      case 'document': return 'Document';
      default: return 'File';
    }
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  
  const handleFileChange = e => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const detectedType = getFileType(selectedFile);
      setFileType(detectedType);
      setFile(selectedFile);
    }
  };

  const handleDrop = e => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const detectedType = getFileType(droppedFile);
      setFileType(detectedType);
      setFile(droppedFile);
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
  
  const handleUnitChange = (event, value) => {
    setSelectedUnit(value);
    if (value) {
      setForm({ ...form, unitId: value._id });
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
      setProgress(0);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed');
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
          getOptionLabel={(option) => `${option.title} (${option.courseCode})`}
          value={selectedCourse}
          onChange={handleCourseChange}
          loading={loading}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Course"
              margin="normal"
              required
              fullWidth
              helperText="Select the course for this content"
            />
          )}
          sx={{ mt: 1 }}
        />

        {units.length > 0 && (
          <Autocomplete
            options={units}
            getOptionLabel={(option) => option.title}
            value={selectedUnit}
            onChange={handleUnitChange}
            loading={loadingUnits}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Unit"
                margin="normal"
                required={units.length > 0}
                fullWidth
                helperText="Select the unit for this content"
              />
            )}
            sx={{ mt: 1 }}
          />
        )}

        <input
          type="file"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="file-input"
          accept="video/*,.pdf,.doc,.docx,.txt,.rtf,.odt"
        />
        <label htmlFor="file-input">
          <Button
            variant="outlined"
            component="span"
            fullWidth
            sx={{ mt: 2, mb: 1 }}
          >
            Choose File
          </Button>
        </label>
        
        {file && (
          <Box sx={{ mt: 1 }}>
            <Chip 
              label={`${file.name} (${getFileTypeLabel(fileType)})`}
              onDelete={() => setFile(null)}
              color={fileType === 'video' ? 'primary' : 'secondary'}
              variant="outlined"
              sx={{ maxWidth: '100%' }}
            />
          </Box>
        )}
        
        {progress > 0 && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" align="center" display="block" sx={{ mt: 0.5 }}>
              Uploading... {Math.round(progress)}%
            </Typography>
          </Box>
        )}
        
        <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1, border: '1px dashed #ccc' }}>
          <Typography variant="body2" color="text.secondary" align="center">
            Drag and drop a video or document file here
          </Typography>
          <Typography variant="caption" color="text.secondary" align="center" display="block">
            Supported: Videos (MP4, AVI, MOV, etc.) & Documents (PDF, DOC, DOCX, TXT)
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
          Upload {fileType === 'video' ? 'Video' : fileType === 'document' ? 'Document' : 'Content'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContentUploadDialog;