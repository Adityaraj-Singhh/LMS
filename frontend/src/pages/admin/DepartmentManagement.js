import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Avatar,
  Tooltip,
  Divider,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as DepartmentIcon,
  School as SchoolIcon,
  Person as PersonIcon,
  MenuBook as CourseIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon
} from '@mui/icons-material';
import axios from 'axios';
import BulkUploadDepartments from '../../components/admin/BulkUploadDepartments';

// Validation helpers
const validateDepartmentCode = (code) => {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'Department code is required' };
  }
  if (code.length < 2) {
    return { valid: false, error: 'Department code must be at least 2 characters' };
  }
  if (code.length > 10) {
    return { valid: false, error: 'Department code cannot exceed 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(code)) {
    return { valid: false, error: 'Department code must contain only letters (A-Z) and numbers (0-9)' };
  }
  return { valid: true, error: '' };
};

const validateDepartmentName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Department name is required' };
  }
  if (name.length < 3) {
    return { valid: false, error: 'Department name must be at least 3 characters' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Department name cannot exceed 100 characters' };
  }
  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[A-Za-z0-9\s&.,'-]+$/.test(name)) {
    return { valid: false, error: 'Department name contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed.' };
  }
  return { valid: true, error: '' };
};

const DepartmentManagement = () => {
  const [departments, setDepartments] = useState([]);
  const [schools, setSchools] = useState([]);
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState({ 
    name: '', 
    code: '', 
    description: '', 
    school: '' 
  });
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [validationErrors, setValidationErrors] = useState({ code: '', name: '' });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDepartments();
    fetchSchools();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await axios.get('/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDepartments(response.data);
    } catch (error) {
      showSnackbar('Error fetching departments', 'error');
    }
  };

  const fetchSchools = async () => {
    try {
      const response = await axios.get('/api/schools', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchools(response.data);
    } catch (error) {
      showSnackbar('Error fetching schools', 'error');
    }
  };

  const handleSubmit = async () => {
    // Validate before submission
    const codeValidation = validateDepartmentCode(currentDepartment.code);
    const nameValidation = validateDepartmentName(currentDepartment.name);
    
    if (!codeValidation.valid || !nameValidation.valid) {
      setValidationErrors({
        code: codeValidation.error,
        name: nameValidation.error
      });
      return;
    }
    
    setLoading(true);
    try {
      if (editMode) {
        await axios.put(`/api/departments/${currentDepartment._id}`, {
          name: currentDepartment.name,
          code: currentDepartment.code,
          description: currentDepartment.description,
          schoolId: currentDepartment.school // Send as schoolId, not school
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Department updated successfully');
      } else {
        await axios.post('/api/departments', {
          name: currentDepartment.name,
          code: currentDepartment.code,
          description: currentDepartment.description,
          schoolId: currentDepartment.school // Send as schoolId, not school
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Department created successfully');
      }
      fetchDepartments();
      handleClose();
    } catch (error) {
      showSnackbar(error.response?.data?.message || 'Error saving department', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this department?')) {
      try {
        await axios.delete(`/api/departments/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Department deleted successfully');
        fetchDepartments();
      } catch (error) {
        showSnackbar(error.response?.data?.message || 'Error deleting department', 'error');
      }
    }
  };

  const handleEdit = (department) => {
    setCurrentDepartment({
      ...department,
      school: department.school._id
    });
    setEditMode(true);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setCurrentDepartment({ name: '', code: '', description: '', school: '' });
    setValidationErrors({ code: '', name: '' });
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Only allow alphanumeric
    if (value.length <= 10) {
      setCurrentDepartment({ ...currentDepartment, code: value });
      const validation = validateDepartmentCode(value);
      setValidationErrors(prev => ({ ...prev, code: value ? validation.error : '' }));
    }
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    if (value.length <= 100) {
      setCurrentDepartment({ ...currentDepartment, name: value });
      const validation = validateDepartmentName(value);
      setValidationErrors(prev => ({ ...prev, name: value ? validation.error : '' }));
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleBulkDepartmentUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(
      '/api/admin/departments/bulk-upload',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Refresh departments
    await fetchDepartments();
    return response.data;
  };

  // Filter departments based on search and school filter
  const filteredDepartments = departments.filter(dept => {
    const matchesSearch = dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dept.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSchool = !filterSchool || dept.school?._id === filterSchool;
    return matchesSearch && matchesSchool;
  });

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Page Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: 'linear-gradient(135deg, #011f4b 0%, #03396c 100%)',
          borderRadius: 3,
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
              <DepartmentIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Department Management
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                Manage all departments across schools
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpen(true)}
            sx={{ 
              background: '#ffffff !important', 
              bgcolor: '#ffffff',
              color: '#011f4b',
              fontWeight: 600,
              px: 3,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              '&:hover': { 
                background: '#f0f0f0 !important',
                bgcolor: '#f0f0f0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)' 
              }
            }}
          >
            Add Department
          </Button>
        </Box>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#011f4b', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <DepartmentIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#011f4b' }}>
                {departments.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Departments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#005b96', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <SchoolIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#005b96' }}>
                {schools.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Schools
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#4caf50', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <PersonIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#4caf50' }}>
                {departments.filter(d => d.hod).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Depts with HODs
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#6497b1', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <CourseIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#6497b1' }}>
                {departments.reduce((acc, d) => acc + (d.courses?.length || 0), 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Courses
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Bulk Upload Section */}
      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: '#011f4b' }}>
              <UploadIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Bulk Department Creation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create multiple departments at once using CSV file
              </Typography>
            </Box>
          </Box>
          <BulkUploadDepartments onUpload={handleBulkDepartmentUpload} />
        </CardContent>
      </Card>

      {/* Departments Table */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Search and Filter Bar */}
          <Box sx={{ p: 3, borderBottom: '1px solid #eee', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search departments..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ 
                width: { xs: '100%', sm: 250 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: '#f5f7fa'
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filter by School</InputLabel>
              <Select
                value={filterSchool}
                label="Filter by School"
                onChange={(e) => setFilterSchool(e.target.value)}
                sx={{ borderRadius: 2, bgcolor: '#f5f7fa' }}
              >
                <MenuItem value="">All Schools</MenuItem>
                {schools.map((school) => (
                  <MenuItem key={school._id} value={school._id}>
                    {school.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Department Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>School</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>HOD</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Courses</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDepartments.map((department) => (
                  <TableRow 
                    key={department._id} 
                    sx={{ 
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <TableCell>
                      <Chip 
                        label={department.code} 
                        size="small"
                        sx={{ 
                          bgcolor: '#011f4b15', 
                          color: '#011f4b', 
                          fontWeight: 600,
                          borderRadius: 1.5
                        }} 
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: '#011f4b', width: 32, height: 32, fontSize: 14 }}>
                          {department.name.charAt(0)}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {department.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        icon={<SchoolIcon sx={{ fontSize: 16 }} />}
                        label={department.school?.name || 'N/A'} 
                        size="small"
                        sx={{ 
                          bgcolor: '#005b9615', 
                          color: '#005b96',
                          fontWeight: 500,
                          '& .MuiChip-icon': { color: '#005b96' }
                        }} 
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {department.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {department.hod ? (
                        <Chip 
                          icon={<PersonIcon sx={{ fontSize: 16 }} />}
                          label={department.hod.name} 
                          size="small"
                          sx={{ 
                            bgcolor: '#4caf5015', 
                            color: '#4caf50',
                            fontWeight: 500,
                            '& .MuiChip-icon': { color: '#4caf50' }
                          }} 
                        />
                      ) : (
                        <Chip 
                          label="No HOD" 
                          size="small"
                          sx={{ 
                            bgcolor: '#ff980015', 
                            color: '#ff9800',
                            fontWeight: 500
                          }} 
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        icon={<CourseIcon sx={{ fontSize: 16 }} />}
                        label={`${department.courses?.length || 0} Courses`}
                        size="small"
                        sx={{ 
                          bgcolor: '#6497b115', 
                          color: '#6497b1',
                          fontWeight: 500,
                          '& .MuiChip-icon': { color: '#6497b1' }
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit Department">
                        <IconButton 
                          onClick={() => handleEdit(department)} 
                          size="small"
                          sx={{ 
                            color: '#011f4b',
                            '&:hover': { bgcolor: '#011f4b15' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Department">
                        <IconButton 
                          onClick={() => handleDelete(department._id)} 
                          size="small"
                          sx={{ 
                            color: '#ef5350',
                            '&:hover': { bgcolor: '#ef535015' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDepartments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm || filterSchool ? 'No departments found matching your criteria' : 'No departments found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #011f4b 0%, #03396c 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DepartmentIcon />
            {editMode ? 'Edit Department' : 'Add New Department'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth margin="dense" sx={{ mb: 2, mt: 1 }}>
            <InputLabel>School *</InputLabel>
            <Select
              value={currentDepartment.school}
              onChange={(e) => setCurrentDepartment({ ...currentDepartment, school: e.target.value })}
              label="School *"
            >
              {schools.map((school) => (
                <MenuItem key={school._id} value={school._id}>
                  {school.name} ({school.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            margin="dense"
            label="Department Code *"
            fullWidth
            variant="outlined"
            value={currentDepartment.code}
            onChange={handleCodeChange}
            error={!!validationErrors.code}
            helperText={validationErrors.code || `${currentDepartment.code.length}/10 characters (A-Z, 0-9 only, min 2)`}
            sx={{ mb: 2 }}
            placeholder="e.g., CSE, ECE"
            inputProps={{ maxLength: 10 }}
          />
          <TextField
            margin="dense"
            label="Department Name *"
            fullWidth
            variant="outlined"
            value={currentDepartment.name}
            onChange={handleNameChange}
            error={!!validationErrors.name}
            helperText={validationErrors.name || `${currentDepartment.name.length}/100 characters`}
            sx={{ mb: 2 }}
            placeholder="e.g., Computer Science"
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={currentDepartment.description}
            onChange={(e) => setCurrentDepartment({ ...currentDepartment, description: e.target.value })}
            placeholder="Brief description of the department..."
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={handleClose}
            sx={{ color: '#64748b' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={loading || !currentDepartment.name || !currentDepartment.code || !currentDepartment.school || !!validationErrors.code || !!validationErrors.name}
            sx={{ 
              background: 'linear-gradient(135deg, #011f4b 0%, #03396c 100%)',
              px: 3
            }}
          >
            {loading ? 'Saving...' : (editMode ? 'Update Department' : 'Create Department')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DepartmentManagement;
