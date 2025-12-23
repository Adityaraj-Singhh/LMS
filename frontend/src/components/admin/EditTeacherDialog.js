import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  FormControlLabel,
  Checkbox,
  Divider,
  Chip
} from '@mui/material';
import axios from 'axios';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const EditTeacherDialog = ({ open, teacher, onClose, onSubmit }) => {
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [removeFromOldCourses, setRemoveFromOldCourses] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const token = localStorage.getItem('token');
  
  // Fetch schools on mount
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const response = await axios.get('/api/schools', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSchools(response.data);
      } catch (err) {
        console.error('Error fetching schools:', err);
      }
    };
    
    if (open) {
      fetchSchools();
    }
  }, [open, token]);
  
  // Set initial values when teacher changes
  useEffect(() => {
    if (teacher && open) {
      const schoolId = typeof teacher.school === 'object' ? teacher.school._id : teacher.school;
      const deptId = typeof teacher.department === 'object' ? teacher.department._id : teacher.department;
      setSelectedSchool(schoolId || '');
      setSelectedDepartment(deptId || '');
      setRemoveFromOldCourses(true);
      setError('');
    }
  }, [teacher, open]);
  
  // Fetch departments when school changes
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!selectedSchool) {
        setDepartments([]);
        return;
      }
      
      try {
        const response = await axios.get(`/api/departments?school=${selectedSchool}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDepartments(response.data);
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    
    fetchDepartments();
  }, [selectedSchool, token]);
  
  const handleSchoolChange = (e) => {
    setSelectedSchool(e.target.value);
    setSelectedDepartment(''); // Reset department when school changes
  };
  
  const handleSubmit = async () => {
    if (!selectedSchool || !selectedDepartment) {
      setError('Please select both school and department');
      return;
    }
    
    // Check if anything changed
    const currentSchool = typeof teacher.school === 'object' ? teacher.school._id : teacher.school;
    const currentDept = typeof teacher.department === 'object' ? teacher.department._id : teacher.department;
    
    if (selectedSchool === currentSchool && selectedDepartment === currentDept) {
      setError('No changes detected. Please select a different school or department.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await onSubmit({
        newSchool: selectedSchool,
        newDepartment: selectedDepartment,
        removeFromOldCourses
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to transfer teacher');
    } finally {
      setLoading(false);
    }
  };
  
  // Get current school/department names for display
  const currentSchoolName = teacher?.school 
    ? (typeof teacher.school === 'object' ? teacher.school.name : 'Unknown School')
    : 'No School';
  
  const currentDeptName = teacher?.department
    ? (typeof teacher.department === 'object' ? teacher.department.name : 'Unknown Department')
    : 'No Department';
  
  // Check if school/department has changed
  const currentSchoolId = typeof teacher?.school === 'object' ? teacher?.school._id : teacher?.school;
  const currentDeptId = typeof teacher?.department === 'object' ? teacher?.department._id : teacher?.department;
  const hasSchoolChanged = selectedSchool && selectedSchool !== currentSchoolId;
  const hasDeptChanged = selectedDepartment && selectedDepartment !== currentDeptId;
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SwapHorizIcon color="primary" />
        Transfer Teacher - {teacher?.name}
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {/* Current Assignment Info */}
        <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Current Assignment
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={currentSchoolName} color="default" size="small" />
            <Chip label={currentDeptName} color="default" size="small" />
          </Box>
        </Box>
        
        <Divider sx={{ mb: 2 }} />
        
        <Typography variant="subtitle2" color="primary" gutterBottom>
          New Assignment
        </Typography>
        
        {/* School Selection */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>School *</InputLabel>
          <Select
            value={selectedSchool}
            onChange={handleSchoolChange}
            label="School *"
          >
            {schools.map((school) => (
              <MenuItem key={school._id} value={school._id}>
                {school.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {/* Department Selection */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Department *</InputLabel>
          <Select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            label="Department *"
            disabled={!selectedSchool}
          >
            {departments.map((dept) => (
              <MenuItem key={dept._id} value={dept._id}>
                {dept.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {/* Warning and Option */}
        {(hasSchoolChanged || hasDeptChanged) && (
          <Box sx={{ mt: 2, p: 2, bgcolor: '#fff3e0', borderRadius: 1, border: '1px solid #ffb74d' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
              <WarningAmberIcon color="warning" />
              <Typography variant="body2" color="text.secondary">
                Transferring this teacher will change their organizational assignment.
              </Typography>
            </Box>
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={removeFromOldCourses}
                  onChange={(e) => setRemoveFromOldCourses(e.target.checked)}
                  color="warning"
                />
              }
              label={
                <Typography variant="body2">
                  Remove teacher from all current course/section assignments
                </Typography>
              }
            />
            
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, ml: 4 }}>
              {removeFromOldCourses 
                ? "The teacher will be removed from all sections and courses in the old department. They can then be assigned to new courses in the new department."
                : "The teacher will keep their existing course assignments. This may cause inconsistencies if courses belong to a different department."
              }
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="primary"
          disabled={loading || !selectedSchool || !selectedDepartment}
        >
          {loading ? 'Transferring...' : 'Transfer Teacher'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditTeacherDialog;
