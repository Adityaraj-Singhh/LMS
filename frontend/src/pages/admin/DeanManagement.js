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
  Grid,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Divider,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import DeanIcon from '@mui/icons-material/AccountBalance';
import AssignIcon from '@mui/icons-material/Assignment';
import SchoolIcon from '@mui/icons-material/School';
import PersonIcon from '@mui/icons-material/Person';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SearchIcon from '@mui/icons-material/Search';
import UploadIcon from '@mui/icons-material/CloudUpload';
import InputAdornment from '@mui/material/InputAdornment';
import axios from 'axios';
import { 
  assignDeanToSchool, 
  removeDeanFromSchool, 
  getAllSchools, 
  getAvailableDeansForSchool 
} from '../../api/hierarchyApi';
import BulkUploadDeans from '../../components/admin/BulkUploadDeans';

const DeanManagement = () => {
  const [deans, setDeans] = useState([]);
  const [schools, setSchools] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [availableDeans, setAvailableDeans] = useState([]);
  const [open, setOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentDean, setCurrentDean] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    school: '',
    teacherId: '',
    uid: '' // Optional: 5-6 digit staff UID
  });
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedDeanForAssignment, setSelectedDeanForAssignment] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Reset password dialog state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetDeanId, setResetDeanId] = useState('');
  const [resetDeanName, setResetDeanName] = useState('');
  const [newDeanPassword, setNewDeanPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchDeans();
    fetchSchoolsData();
    fetchTeachers();
  }, []);

  const fetchSchoolsData = async () => {
    try {
      console.log('Fetching schools data...');
      const schoolsData = await getAllSchools();
      console.log('Schools data received:', schoolsData);
      setSchools(schoolsData);
    } catch (error) {
      console.error('Error fetching schools:', error);
      showSnackbar('Error fetching schools', 'error');
    }
  };

  const handleAssignDean = async () => {
    if (!selectedSchool || !selectedDeanForAssignment) {
      showSnackbar('Please select both school and dean', 'error');
      return;
    }

    setLoading(true);
    try {
      await assignDeanToSchool(selectedSchool, selectedDeanForAssignment);
      showSnackbar('Dean assigned successfully');
      setAssignDialog(false);
      setSelectedSchool('');
      setSelectedDeanForAssignment('');
      fetchDeans();
      fetchSchoolsData();
    } catch (error) {
      showSnackbar(error.message || 'Error assigning dean', 'error');
    }
    setLoading(false);
  };

  const handleRemoveDean = async (schoolId) => {
    if (window.confirm('Are you sure you want to remove the dean from this school?')) {
      try {
        await removeDeanFromSchool(schoolId);
        showSnackbar('Dean removed successfully');
        fetchDeans();
        fetchSchoolsData();
      } catch (error) {
        showSnackbar(error.message || 'Error removing dean', 'error');
      }
    }
  };

  // Deassign dean from their current school (unlink without deleting)
  const handleDeassignDean = async (dean) => {
    if (!dean.school) {
      showSnackbar('Dean is not assigned to any school', 'warning');
      return;
    }
    if (window.confirm(`Are you sure you want to unassign ${dean.name} from ${dean.school.name}? The dean will remain in the system but won't be linked to any school.`)) {
      try {
        await axios.post('/api/admin/deans/deassign', {
          deanId: dean._id
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Dean unassigned from school successfully');
        fetchDeans();
        fetchSchoolsData();
      } catch (error) {
        showSnackbar(error.response?.data?.message || 'Error unassigning dean', 'error');
      }
    }
  };

  // Get schools available for dean creation (schools without deans)
  const getAvailableSchoolsForCreation = () => {
    return schools.filter(school => !school.dean);
  };

  // Get schools available for dean editing (current school + schools without deans)
  const getAvailableSchoolsForEdit = (currentSchoolId) => {
    return schools.filter(school => !school.dean || school._id === currentSchoolId);
  };

  const openAssignDialog = async () => {
    try {
      setAssignDialog(true);
    } catch (error) {
      showSnackbar('Error opening assignment dialog', 'error');
    }
  };

  const handleSchoolSelection = async (schoolId) => {
    setSelectedSchool(schoolId);
    if (schoolId) {
      try {
        const availableDeansData = await getAvailableDeansForSchool(schoolId);
        setAvailableDeans(availableDeansData);
      } catch (error) {
        showSnackbar('Error fetching available deans', 'error');
      }
    }
  };

  const fetchDeans = async () => {
    try {
      const response = await axios.get('/api/admin/deans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeans(response.data);
    } catch (error) {
      showSnackbar('Error fetching deans', 'error');
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

  const fetchTeachers = async () => {
    try {
      const response = await axios.get('/api/admin/teachers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTeachers(response.data.filter(teacher => teacher.role === 'teacher'));
    } catch (error) {
      showSnackbar('Error fetching teachers', 'error');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editMode) {
        await axios.put(`/api/admin/deans/${currentDean._id}`, {
          name: currentDean.name,
          email: currentDean.email,
          schoolId: currentDean.school, // Send as schoolId, not school
          isActive: currentDean.isActive
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Dean updated successfully');
      } else {
        const deanData = {
          name: currentDean.name,
          email: currentDean.email,
          password: currentDean.password,
          schoolId: currentDean.school,
          role: 'dean'
        };
        // Add uid if provided (optional)
        if (currentDean.uid && currentDean.uid.trim()) {
          deanData.uid = currentDean.uid.trim();
        }
        await axios.post('/api/admin/deans', deanData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Dean created successfully');
      }
      fetchDeans();
      handleClose();
    } catch (error) {
      showSnackbar(error.response?.data?.message || 'Error saving dean', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this dean?')) {
      try {
        await axios.delete(`/api/admin/deans/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('Dean deleted successfully');
        fetchDeans();
      } catch (error) {
        showSnackbar(error.response?.data?.message || 'Error deleting dean', 'error');
      }
    }
  };

  const handleEdit = (dean) => {
    setCurrentDean({
      ...dean,
      school: dean.school?._id || '',
      password: '' // Don't populate password for security
    });
    setEditMode(true);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setCurrentDean({ name: '', email: '', password: '', school: '', teacherId: '', uid: '' });
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleBulkDeanUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(
      '/api/admin/deans/bulk-upload',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Refresh deans and schools
    await Promise.all([fetchDeans(), fetchSchoolsData()]);
    return response.data;
  };

  const openResetDialog = (dean) => {
    setResetDeanId(dean._id);
    setResetDeanName(dean.name || dean.email);
    setNewDeanPassword('');
    setResetDialogOpen(true);
  };

  const closeResetDialog = () => {
    setResetDialogOpen(false);
    setResetDeanId('');
    setResetDeanName('');
    setNewDeanPassword('');
    setResetLoading(false);
  };

  const handleResetPassword = async () => {
    if (!newDeanPassword || newDeanPassword.length < 6) {
      showSnackbar('Please enter a password with at least 6 characters', 'error');
      return;
    }
    try {
      setResetLoading(true);
      await axios.post('/api/admin/deans/reset-password', {
        deanId: resetDeanId,
        newPassword: newDeanPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showSnackbar('Dean password reset successfully');
      closeResetDialog();
    } catch (error) {
      showSnackbar(error.response?.data?.message || 'Error resetting password', 'error');
      setResetLoading(false);
    }
  };

  // Filter deans based on search
  const filteredDeans = deans.filter(dean =>
    dean.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dean.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fa', minHeight: '100vh' }}>
      {/* Page Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3, 
          background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
          borderRadius: 3,
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
              <DeanIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Dean Management
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                Manage Deans and their school assignments
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpen(true)}
              sx={{ 
                background: '#ffffff !important', 
                bgcolor: '#ffffff',
                color: '#011f4b',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                '&:hover': { 
                  background: '#f0f0f0 !important',
                  bgcolor: '#f0f0f0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)' 
                }
              }}
            >
              Add Dean
            </Button>
            <Button
              variant="outlined"
              startIcon={<AssignIcon />}
              onClick={openAssignDialog}
              sx={{ 
                borderColor: 'white',
                color: 'white',
                fontWeight: 600,
                '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' }
              }}
            >
              Assign Dean
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#005b96', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <DeanIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#005b96' }}>
                {deans.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Deans
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
                {deans.filter(d => d.school).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Assigned Deans
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
                {deans.filter(d => !d.school).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unassigned Deans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ bgcolor: '#6497b1', width: 48, height: 48, mx: 'auto', mb: 1 }}>
                <SchoolIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#6497b1' }}>
                {schools.filter(s => !s.dean).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Schools without Dean
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
                Bulk Dean Creation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create multiple Deans at once and assign to schools using CSV file
              </Typography>
            </Box>
          </Box>
          <BulkUploadDeans onUpload={handleBulkDeanUpload} />
        </CardContent>
      </Card>

      {/* Schools with Dean Assignments */}
      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Avatar sx={{ bgcolor: '#005b96' }}>
              <SchoolIcon />
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Schools & Dean Assignments
            </Typography>
          </Box>
          
          <Grid container spacing={2}>
            {schools.map((school) => (
              <Grid item xs={12} sm={6} md={4} key={school._id}>
                <Card 
                  variant="outlined" 
                  sx={{ 
                    borderRadius: 2,
                    transition: 'all 0.2s',
                    '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {school.name}
                        </Typography>
                        <Chip 
                          label={school.code} 
                          size="small" 
                          sx={{ bgcolor: '#005b9615', color: '#005b96', fontSize: '0.7rem' }} 
                        />
                      </Box>
                      {school.dean ? (
                        <Tooltip title="Remove Dean">
                          <IconButton 
                            size="small"
                            onClick={() => handleRemoveDean(school._id)}
                            sx={{ color: '#ef5350', '&:hover': { bgcolor: '#ef535015' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Assign Dean">
                          <IconButton 
                            size="small"
                            onClick={openAssignDialog}
                            sx={{ color: '#005b96', '&:hover': { bgcolor: '#005b9615' } }}
                          >
                            <AssignIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {school.dean ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#4caf5008', borderRadius: 1.5 }}>
                        <Avatar sx={{ bgcolor: '#4caf50', width: 36, height: 36, fontSize: 14 }}>
                          {school.dean.name?.charAt(0) || 'D'}
                        </Avatar>
                        <Box sx={{ overflow: 'hidden' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {school.dean.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {school.dean.email}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2, bgcolor: '#ff980008', borderRadius: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          No Dean Assigned
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* All Deans Table */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Header and Search */}
          <Box sx={{ p: 3, borderBottom: '1px solid #eee' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar sx={{ bgcolor: '#005b96' }}>
                <PersonIcon />
              </Avatar>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                All Deans
              </Typography>
            </Box>
            <TextField
              placeholder="Search deans..."
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
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Dean ID</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>School</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDeans.map((dean) => (
                  <TableRow 
                    key={dean._id}
                    sx={{ 
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <TableCell>
                      <Chip 
                        label={dean.teacherId || dean.deanId || 'N/A'} 
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
                          {dean.name?.charAt(0) || 'D'}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {dean.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {dean.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {dean.school ? (
                        <Chip 
                          icon={<SchoolIcon sx={{ fontSize: 16 }} />}
                          label={dean.school.name} 
                          size="small"
                          sx={{ 
                            bgcolor: '#005b9615', 
                            color: '#005b96',
                            fontWeight: 500,
                            '& .MuiChip-icon': { color: '#005b96' }
                          }} 
                        />
                      ) : (
                        <Chip 
                          label="Not Assigned" 
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
                        label={dean.isActive !== false ? 'Active' : 'Inactive'} 
                        size="small"
                        sx={{ 
                          bgcolor: dean.isActive !== false ? '#4caf5015' : '#ef535015',
                          color: dean.isActive !== false ? '#4caf50' : '#ef5350',
                          fontWeight: 600
                        }} 
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit Dean">
                        <IconButton 
                          onClick={() => handleEdit(dean)} 
                          size="small"
                          sx={{ 
                            color: '#005b96',
                            '&:hover': { bgcolor: '#005b9615' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {dean.school && (
                        <Tooltip title="Unassign from School">
                          <IconButton 
                            onClick={() => handleDeassignDean(dean)} 
                            size="small"
                            sx={{ 
                              color: '#ff9800',
                              '&:hover': { bgcolor: '#ff980015' }
                            }}
                          >
                            <LinkOffIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Reset Password">
                        <IconButton 
                          onClick={() => openResetDialog(dean)} 
                          size="small"
                          sx={{ 
                            color: '#2196f3',
                            '&:hover': { bgcolor: '#2196f315' }
                          }}
                        >
                          <LockResetIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Dean">
                        <IconButton 
                          onClick={() => handleDelete(dean._id)} 
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
                {filteredDeans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm ? 'No deans found matching your search' : 'No deans found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Assign Dean Dialog */}
      <Dialog 
        open={assignDialog} 
        onClose={() => setAssignDialog(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AssignIcon />
            Assign Dean to School
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
            <InputLabel>Select School *</InputLabel>
            <Select
              value={selectedSchool}
              label="Select School *"
              onChange={(e) => handleSchoolSelection(e.target.value)}
            >
              {schools.filter(school => !school.dean).length === 0 ? (
                <MenuItem disabled>
                  <em>All schools have deans assigned</em>
                </MenuItem>
              ) : (
                schools.filter(school => !school.dean).map((school) => (
                  <MenuItem key={school._id} value={school._id}>
                    {school.name} ({school.code})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Dean *</InputLabel>
            <Select
              value={selectedDeanForAssignment}
              label="Select Dean *"
              onChange={(e) => setSelectedDeanForAssignment(e.target.value)}
              disabled={!selectedSchool}
            >
              {availableDeans.length === 0 ? (
                <MenuItem disabled>
                  <em>{selectedSchool ? 'No available deans' : 'Please select a school first'}</em>
                </MenuItem>
              ) : (
                availableDeans.map((dean) => (
                  <MenuItem key={dean._id} value={dean._id}>
                    {dean.name} ({dean.email})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAssignDialog(false)} sx={{ color: '#64748b' }}>Cancel</Button>
          <Button 
            onClick={handleAssignDean} 
            variant="contained"
            disabled={!selectedSchool || !selectedDeanForAssignment || loading}
            sx={{ 
              background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
              px: 3
            }}
          >
            {loading ? 'Assigning...' : 'Assign Dean'}
          </Button>
        </DialogActions>
      </Dialog>

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
          background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DeanIcon />
            {editMode ? 'Edit Dean' : 'Add New Dean'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Name *"
            fullWidth
            variant="outlined"
            value={currentDean.name}
            onChange={(e) => setCurrentDean({ ...currentDean, name: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
            placeholder="Full name"
          />
          <TextField
            margin="dense"
            label="Email *"
            type="email"
            fullWidth
            variant="outlined"
            value={currentDean.email}
            onChange={(e) => setCurrentDean({ ...currentDean, email: e.target.value })}
            sx={{ mb: 2 }}
            placeholder="email@example.com"
          />
          {!editMode && (
            <TextField
              margin="dense"
              label="Password *"
              type="password"
              fullWidth
              variant="outlined"
              value={currentDean.password}
              onChange={(e) => setCurrentDean({ ...currentDean, password: e.target.value })}
              sx={{ mb: 2 }}
              placeholder="Min 6 characters"
            />
          )}
          {!editMode && (
            <TextField
              margin="dense"
              label="UID (Optional)"
              fullWidth
              variant="outlined"
              value={currentDean.uid}
              onChange={(e) => setCurrentDean({ ...currentDean, uid: e.target.value })}
              sx={{ mb: 2 }}
              helperText="5-6 digit numeric UID (e.g., 10001). Leave empty for auto-generation."
              inputProps={{ maxLength: 6 }}
              error={currentDean.uid && !/^\d{5,6}$/.test(currentDean.uid)}
            />
          )}
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel>School</InputLabel>
            <Select
              value={currentDean.school}
              onChange={(e) => setCurrentDean({ ...currentDean, school: e.target.value })}
              label="School"
            >
              {(() => {
                const availableSchools = editMode 
                  ? getAvailableSchoolsForEdit(currentDean.school)
                  : getAvailableSchoolsForCreation();
                
                if (availableSchools.length === 0) {
                  return (
                    <MenuItem disabled>
                      <em>No schools available (all schools have deans assigned)</em>
                    </MenuItem>
                  );
                }
                
                return availableSchools.map((school) => (
                  <MenuItem key={school._id} value={school._id}>
                    {school.name} ({school.code})
                    {school._id === currentDean.school && editMode && ' (Current)'}
                  </MenuItem>
                ));
              })()}
            </Select>
            {!editMode && getAvailableSchoolsForCreation().length === 0 && (
              <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                All schools already have deans. Please unassign a dean first or create a new school.
              </Typography>
            )}
          </FormControl>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} sx={{ color: '#64748b' }}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={loading || !currentDean.name || !currentDean.email || (!editMode && !currentDean.password)}
            sx={{ 
              background: 'linear-gradient(135deg, #005b96 0%, #6497b1 100%)',
              px: 3
            }}
          >
            {loading ? 'Saving...' : (editMode ? 'Update Dean' : 'Create Dean')}
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

      {/* Reset Password Dialog */}
      <Dialog 
        open={resetDialogOpen} 
        onClose={closeResetDialog} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #2196f3 0%, #21cbf3 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LockResetIcon />
            Reset Password
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, mt: 1 }}>
            Enter a new password for <strong>{resetDeanName}</strong>
          </Typography>
          <TextField
            label="New Password *"
            type="password"
            fullWidth
            value={newDeanPassword}
            onChange={(e) => setNewDeanPassword(e.target.value)}
            autoFocus
            placeholder="Min 6 characters"
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeResetDialog} sx={{ color: '#64748b' }}>Cancel</Button>
          <Button 
            onClick={handleResetPassword} 
            variant="contained" 
            disabled={resetLoading || !newDeanPassword || newDeanPassword.length < 6}
            sx={{ 
              background: 'linear-gradient(135deg, #2196f3 0%, #21cbf3 100%)',
              px: 3
            }}
          >
            {resetLoading ? 'Saving...' : 'Reset Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeanManagement;
