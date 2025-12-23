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
  School as SchoolIcon,
  Business as DepartmentIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon
} from '@mui/icons-material';
import axios from 'axios';
import BulkUploadSchools from '../../components/admin/BulkUploadSchools';

// Validation helpers
const validateSchoolCode = (code) => {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'School code is required' };
  }
  if (code.length < 3) {
    return { valid: false, error: 'School code must be at least 3 characters' };
  }
  if (code.length > 10) {
    return { valid: false, error: 'School code cannot exceed 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(code)) {
    return { valid: false, error: 'School code must contain only letters (A-Z) and numbers (0-9)' };
  }
  return { valid: true, error: '' };
};

const validateSchoolName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'School name is required' };
  }
  if (name.length < 3) {
    return { valid: false, error: 'School name must be at least 3 characters' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'School name cannot exceed 100 characters' };
  }
  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[A-Za-z0-9\s&.,'-]+$/.test(name)) {
    return { valid: false, error: 'School name contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed.' };
  }
  return { valid: true, error: '' };
};

const SchoolManagement = () => {
  const [schools, setSchools] = useState([]);
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentSchool, setCurrentSchool] = useState({ name: '', code: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchTerm, setSearchTerm] = useState('');
  const [validationErrors, setValidationErrors] = useState({ code: '', name: '' });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchSchools();
  }, []);

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
    const codeValidation = validateSchoolCode(currentSchool.code);
    const nameValidation = validateSchoolName(currentSchool.name);
    
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
        await axios.put(`/api/schools/${currentSchool._id}`, currentSchool, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('School updated successfully');
      } else {
        await axios.post('/api/schools', currentSchool, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('School created successfully');
      }
      fetchSchools();
      handleClose();
    } catch (error) {
      showSnackbar(error.response?.data?.message || 'Error saving school', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this school?')) {
      try {
        await axios.delete(`/api/schools/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('School deleted successfully');
        fetchSchools();
      } catch (error) {
        showSnackbar(error.response?.data?.message || 'Error deleting school', 'error');
      }
    }
  };

  const handleEdit = (school) => {
    setCurrentSchool(school);
    setEditMode(true);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setCurrentSchool({ name: '', code: '', description: '' });
    setValidationErrors({ code: '', name: '' });
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Only allow alphanumeric
    if (value.length <= 10) {
      setCurrentSchool({ ...currentSchool, code: value });
      const validation = validateSchoolCode(value);
      setValidationErrors(prev => ({ ...prev, code: value ? validation.error : '' }));
    }
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    if (value.length <= 100) {
      setCurrentSchool({ ...currentSchool, name: value });
      const validation = validateSchoolName(value);
      setValidationErrors(prev => ({ ...prev, name: value ? validation.error : '' }));
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleBulkSchoolUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(
      '/api/admin/schools/bulk-upload',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Refresh schools
    await fetchSchools();
    return response.data;
  };

  // Filter schools based on search term
  const filteredSchools = schools.filter(school =>
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    school.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <SchoolIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                School Management
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                Manage all schools and their departments
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
            Add School
          </Button>
        </Box>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
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
                Total Schools
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
                {schools.filter(s => s.dean).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Schools with Deans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#ff9800', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <PersonIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#ff9800' }}>
                {schools.filter(s => !s.dean).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Schools without Deans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#6497b1', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <DepartmentIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#6497b1' }}>
                {schools.reduce((acc, s) => acc + (s.departments?.length || 0), 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Departments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Bulk Upload Section */}
      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: '#005b96' }}>
              <UploadIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Bulk School Creation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create multiple schools at once using CSV file
              </Typography>
            </Box>
          </Box>
          <BulkUploadSchools onUpload={handleBulkSchoolUpload} />
        </CardContent>
      </Card>

      {/* Schools Table */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Search Bar */}
          <Box sx={{ p: 3, borderBottom: '1px solid #eee' }}>
            <TextField
              placeholder="Search schools by name or code..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ 
                width: { xs: '100%', sm: 300 },
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
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>School Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Dean</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Departments</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSchools.map((school) => (
                  <TableRow 
                    key={school._id} 
                    sx={{ 
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <TableCell>
                      <Chip 
                        label={school.code} 
                        size="small"
                        sx={{ 
                          bgcolor: '#005b9615', 
                          color: '#005b96', 
                          fontWeight: 600,
                          borderRadius: 1.5
                        }} 
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: '#005b96', width: 32, height: 32, fontSize: 14 }}>
                          {school.name.charAt(0)}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {school.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {school.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {school.dean ? (
                        <Chip 
                          icon={<PersonIcon sx={{ fontSize: 16 }} />}
                          label={school.dean.name} 
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
                          label="No Dean" 
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
                        icon={<DepartmentIcon sx={{ fontSize: 16 }} />}
                        label={`${school.departments?.length || 0} Depts`}
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
                      <Tooltip title="Edit School">
                        <IconButton 
                          onClick={() => handleEdit(school)} 
                          size="small"
                          sx={{ 
                            color: '#005b96',
                            '&:hover': { bgcolor: '#005b9615' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete School">
                        <IconButton 
                          onClick={() => handleDelete(school._id)} 
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
                {filteredSchools.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm ? 'No schools found matching your search' : 'No schools found'}
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
          background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <SchoolIcon />
            {editMode ? 'Edit School' : 'Add New School'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label="School Code *"
            fullWidth
            variant="outlined"
            value={currentSchool.code}
            onChange={handleCodeChange}
            error={!!validationErrors.code}
            helperText={validationErrors.code || `${currentSchool.code.length}/10 characters (A-Z, 0-9 only, min 3)`}
            sx={{ mb: 2, mt: 1 }}
            placeholder="e.g., SOE, SOM"
            inputProps={{ maxLength: 10 }}
          />
          <TextField
            margin="dense"
            label="School Name *"
            fullWidth
            variant="outlined"
            value={currentSchool.name}
            onChange={handleNameChange}
            error={!!validationErrors.name}
            helperText={validationErrors.name || `${currentSchool.name.length}/100 characters`}
            sx={{ mb: 2 }}
            placeholder="e.g., School of Engineering"
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={currentSchool.description}
            onChange={(e) => setCurrentSchool({ ...currentSchool, description: e.target.value })}
            placeholder="Brief description of the school..."
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
            disabled={loading || !currentSchool.name || !currentSchool.code || !!validationErrors.code || !!validationErrors.name}
            sx={{ 
              background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)',
              px: 3
            }}
          >
            {loading ? 'Saving...' : (editMode ? 'Update School' : 'Create School')}
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

export default SchoolManagement;
