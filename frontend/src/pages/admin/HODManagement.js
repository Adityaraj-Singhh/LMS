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
  Tooltip,
  InputAdornment
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HODIcon from '@mui/icons-material/SupervisorAccount';
import AssignIcon from '@mui/icons-material/Assignment';
import DepartmentIcon from '@mui/icons-material/Business';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import UploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import { 
  assignHODToDepartment, 
  removeHODFromDepartment, 
  getAllSchools,
  getDepartmentsBySchool,
  getAvailableHODsForDepartment 
} from '../../api/hierarchyApi';
import BulkUploadHODs from '../../components/admin/BulkUploadHODs';

const HODManagement = () => {
  const [hods, setHods] = useState([]);
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [availableHODs, setAvailableHODs] = useState([]);
  const [open, setOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentHOD, setCurrentHOD] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    school: '',
    department: '',
    teacherId: '',
    uid: '' // Optional: 5-6 digit staff UID
  });
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedHODForAssignment, setSelectedHODForAssignment] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchool, setFilterSchool] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchHODs();
    fetchSchoolsData();
    fetchDepartments();
    fetchTeachers();
  }, []);

  const fetchSchoolsData = async () => {
    try {
      console.log('Fetching schools data...');
      const schoolsData = await getAllSchools();
      console.log('Schools data received:', schoolsData);
      console.log('First school departments:', schoolsData[0]?.departments);
      console.log('First department HOD:', schoolsData[0]?.departments?.[0]?.hod);
      setSchools(schoolsData);
    } catch (error) {
      console.error('Error fetching schools:', error);
      console.error('Error details:', error.response?.data);
      console.error('Error status:', error.response?.status);
      showSnackbar('Error fetching schools', 'error');
    }
  };

  const handleAssignHOD = async () => {
    if (!selectedDepartment || !selectedHODForAssignment) {
      showSnackbar('Please select both department and HOD', 'error');
      return;
    }

    setLoading(true);
    try {
      await assignHODToDepartment(selectedDepartment, selectedHODForAssignment);
      showSnackbar('HOD assigned successfully');
      setAssignDialog(false);
      setSelectedSchool('');
      setSelectedDepartment('');
      setSelectedHODForAssignment('');
      fetchHODs();
      fetchSchoolsData();
      fetchDepartments();
    } catch (error) {
      showSnackbar(error.message || 'Error assigning HOD', 'error');
    }
    setLoading(false);
  };

  const handleRemoveHOD = async (departmentId) => {
    if (window.confirm('Are you sure you want to remove the HOD from this department?')) {
      try {
        await removeHODFromDepartment(departmentId);
        showSnackbar('HOD removed successfully');
        fetchHODs();
        fetchSchoolsData();
        fetchDepartments();
      } catch (error) {
        showSnackbar(error.message || 'Error removing HOD', 'error');
      }
    }
  };

  const openAssignDialog = async () => {
    try {
      setAssignDialog(true);
    } catch (error) {
      showSnackbar('Error opening assignment dialog', 'error');
    }
  };

  const handleSchoolSelectionForAssignment = async (schoolId) => {
    console.log('=== School Selection Debug ===');
    console.log('Selected school ID:', schoolId);
    
    setSelectedSchool(schoolId);
    setSelectedDepartment('');
    setSelectedHODForAssignment('');
    
    if (schoolId) {
      try {
        console.log('Fetching departments for school:', schoolId);
        console.log('API endpoint will be: /api/departments/school/' + schoolId);
        
        const departmentsData = await getDepartmentsBySchool(schoolId);
        console.log('Raw departments data received:', departmentsData);
        console.log('Number of departments:', departmentsData.length);
        
        const filteredDepartments = departmentsData.filter(dept => !dept.hod);
        console.log('Departments without HOD:', filteredDepartments);
        console.log('Number of departments without HOD:', filteredDepartments.length);
        
        setFilteredDepartments(filteredDepartments);
      } catch (error) {
        console.error('=== Error fetching departments ===');
        console.error('Error object:', error);
        console.error('Error message:', error.message);
        console.error('Error response:', error.response);
        showSnackbar('Error fetching departments', 'error');
      }
    } else {
      setFilteredDepartments([]);
    }
  };

  const handleDepartmentSelectionForAssignment = async (departmentId) => {
    setSelectedDepartment(departmentId);
    setSelectedHODForAssignment('');
    
    if (departmentId) {
      try {
        console.log('Fetching available HODs for department:', departmentId);
        const availableHODsData = await getAvailableHODsForDepartment(departmentId);
        console.log('Available HODs data received:', availableHODsData);
        setAvailableHODs(availableHODsData);
      } catch (error) {
        console.error('Error fetching available HODs:', error);
        showSnackbar('Error fetching available HODs', 'error');
      }
    }
  };

  // Filter departments when school changes
  useEffect(() => {
    if (currentHOD.school) {
      const filtered = departments.filter(dept => 
        dept.school && dept.school._id === currentHOD.school
      );
      setFilteredDepartments(filtered);
      // Reset department selection if the current department doesn't belong to the selected school
      if (currentHOD.department && !filtered.find(dept => dept._id === currentHOD.department)) {
        setCurrentHOD(prev => ({ ...prev, department: '' }));
      }
    } else {
      setFilteredDepartments([]);
      setCurrentHOD(prev => ({ ...prev, department: '' }));
    }
  }, [currentHOD.school, departments]);

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

  const fetchHODs = async () => {
    try {
      const response = await axios.get('/api/admin/hods', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHods(response.data);
    } catch (error) {
      showSnackbar('Error fetching HODs', 'error');
    }
  };

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

  const fetchTeachers = async () => {
    try {
      const response = await axios.get('/api/admin/teachers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter teachers to include users with teacher role (both new roles array and legacy role field)
      setTeachers(response.data.filter(teacher => 
        (teacher.roles && teacher.roles.includes('teacher')) || teacher.role === 'teacher'
      ));
    } catch (error) {
      showSnackbar('Error fetching teachers', 'error');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editMode) {
        await axios.put(`/api/admin/hods/${currentHOD._id}`, {
          name: currentHOD.name,
          email: currentHOD.email,
          schoolId: currentHOD.school, // Send as schoolId, not school
          departmentId: currentHOD.department, // Send as departmentId, not department
          isActive: currentHOD.isActive
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('HOD updated successfully');
      } else {
        const hodData = {
          name: currentHOD.name,
          email: currentHOD.email,
          password: currentHOD.password,
          schoolId: currentHOD.school,
          departmentId: currentHOD.department,
          role: 'hod'
        };
        // Add uid if provided (optional)
        if (currentHOD.uid && currentHOD.uid.trim()) {
          hodData.uid = currentHOD.uid.trim();
        }
        await axios.post('/api/admin/hods', hodData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('HOD created successfully');
      }
      fetchHODs();
      handleClose();
    } catch (error) {
      showSnackbar(error.response?.data?.message || 'Error saving HOD', 'error');
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this HOD?')) {
      try {
        await axios.delete(`/api/admin/hods/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showSnackbar('HOD deleted successfully');
        fetchHODs();
      } catch (error) {
        showSnackbar(error.response?.data?.message || 'Error deleting HOD', 'error');
      }
    }
  };

  const handleEdit = (hod) => {
    setCurrentHOD({
      ...hod,
      school: hod.department?.school?._id || hod.department?.school || '',
      department: hod.department?._id || '',
      password: '' // Don't populate password for security
    });
    setEditMode(true);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditMode(false);
    setCurrentHOD({ 
      name: '', 
      email: '', 
      password: '', 
      school: '',
      department: '', 
      teacherId: '',
      uid: ''
    });
    setFilteredDepartments([]);
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleBulkHODUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(
      '/api/admin/hods/bulk-upload',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    // Refresh HODs and schools
    await Promise.all([fetchHODs(), fetchSchoolsData()]);
    return response.data;
  };

  // Filter HODs based on search and school filter
  const filteredHODs = hods.filter(hod => {
    const matchesSearch = hod.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      hod.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSchool = !filterSchool || hod.department?.school?._id === filterSchool;
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
          background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
          borderRadius: 3,
          color: 'white'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
              <HODIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                HOD Management
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                Manage Heads of Departments and their assignments
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
              Add HOD
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
              Assign HOD
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
                <HODIcon />
              </Avatar>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#005b96' }}>
                {hods.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total HODs
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
                {hods.filter(h => h.department).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Assigned HODs
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
                {hods.filter(h => !h.department).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unassigned HODs
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
                {departments.filter(d => !d.hod).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Depts without HOD
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
                Bulk HOD Creation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create multiple HODs at once and assign to departments using CSV file
              </Typography>
            </Box>
          </Box>
          <BulkUploadHODs onUpload={handleBulkHODUpload} />
        </CardContent>
      </Card>

      {/* Departments with HOD Assignments by School */}
      <Card sx={{ mb: 4, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Avatar sx={{ bgcolor: '#6497b1' }}>
              <DepartmentIcon />
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Departments & HOD Assignments
            </Typography>
          </Box>
          
          <Grid container spacing={3}>
            {schools.map((school) => (
              <Grid item xs={12} key={school._id}>
                <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <CardHeader
                    sx={{ bgcolor: '#f8fafc', py: 1.5 }}
                    title={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SchoolIcon sx={{ color: '#005b96' }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {school.name}
                        </Typography>
                        <Chip label={school.code} size="small" sx={{ bgcolor: '#005b9615', color: '#005b96' }} />
                      </Box>
                    }
                  />
                  <CardContent sx={{ p: 2 }}>
                    <Grid container spacing={2}>
                      {school.departments && school.departments.length > 0 ? (
                        school.departments.map((department) => (
                          <Grid item xs={12} sm={6} md={4} key={department._id}>
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
                                      {department.name}
                                    </Typography>
                                    <Chip 
                                      label={department.code} 
                                      size="small" 
                                      sx={{ bgcolor: '#11998e15', color: '#11998e', fontSize: '0.7rem' }} 
                                    />
                                  </Box>
                                  {department.hod ? (
                                    <Tooltip title="Remove HOD">
                                      <IconButton 
                                        size="small"
                                        onClick={() => handleRemoveHOD(department._id)}
                                        sx={{ color: '#ef5350', '&:hover': { bgcolor: '#ef535015' } }}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="Assign HOD">
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
                                {department.hod ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#4caf5008', borderRadius: 1.5 }}>
                                    <Avatar sx={{ bgcolor: '#4caf50', width: 36, height: 36, fontSize: 14 }}>
                                      {department.hod.name?.charAt(0) || 'H'}
                                    </Avatar>
                                    <Box sx={{ overflow: 'hidden' }}>
                                      <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {department.hod.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {department.hod.email}
                                      </Typography>
                                    </Box>
                                  </Box>
                                ) : (
                                  <Box sx={{ textAlign: 'center', py: 2, bgcolor: '#ff980008', borderRadius: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      No HOD Assigned
                                    </Typography>
                                  </Box>
                                )}
                              </CardContent>
                            </Card>
                          </Grid>
                        ))
                      ) : (
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            No departments found for this school
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* All HODs Table */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Header and Search */}
          <Box sx={{ p: 3, borderBottom: '1px solid #eee' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar sx={{ bgcolor: '#005b96' }}>
                <PersonIcon />
              </Avatar>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                All HODs
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                placeholder="Search HODs..."
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
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>HOD ID</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>School</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredHODs.map((hod) => (
                  <TableRow 
                    key={hod._id}
                    sx={{ 
                      '&:hover': { bgcolor: '#f8fafc' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <TableCell>
                      <Chip 
                        label={hod.teacherId || hod.hodId || 'N/A'} 
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
                          {hod.name?.charAt(0) || 'H'}
                        </Avatar>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {hod.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {hod.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {hod.department ? (
                        <Chip 
                          icon={<DepartmentIcon sx={{ fontSize: 16 }} />}
                          label={hod.department.name} 
                          size="small"
                          sx={{ 
                            bgcolor: '#11998e15', 
                            color: '#11998e',
                            fontWeight: 500,
                            '& .MuiChip-icon': { color: '#11998e' }
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
                      {hod.department?.school ? (
                        <Chip 
                          icon={<SchoolIcon sx={{ fontSize: 16 }} />}
                          label={hod.department.school.name} 
                          size="small"
                          sx={{ 
                            bgcolor: '#005b9615', 
                            color: '#005b96',
                            fontWeight: 500,
                            '& .MuiChip-icon': { color: '#005b96' }
                          }} 
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={hod.isActive !== false ? 'Active' : 'Inactive'} 
                        size="small"
                        sx={{ 
                          bgcolor: hod.isActive !== false ? '#4caf5015' : '#ef535015',
                          color: hod.isActive !== false ? '#4caf50' : '#ef5350',
                          fontWeight: 600
                        }} 
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit HOD">
                        <IconButton 
                          onClick={() => handleEdit(hod)} 
                          size="small"
                          sx={{ 
                            color: '#005b96',
                            '&:hover': { bgcolor: '#005b9615' }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete HOD">
                        <IconButton 
                          onClick={() => handleDelete(hod._id)} 
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
                {filteredHODs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm || filterSchool ? 'No HODs found matching your criteria' : 'No HODs found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Assign HOD Dialog */}
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
          background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AssignIcon />
            Assign HOD to Department
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
            <InputLabel>Select School *</InputLabel>
            <Select
              value={selectedSchool}
              label="Select School *"
              onChange={(e) => handleSchoolSelectionForAssignment(e.target.value)}
            >
              {schools.map((school) => (
                <MenuItem key={school._id} value={school._id}>
                  {school.name} ({school.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Department *</InputLabel>
            <Select
              value={selectedDepartment}
              label="Select Department *"
              onChange={(e) => handleDepartmentSelectionForAssignment(e.target.value)}
              disabled={!selectedSchool}
            >
              {filteredDepartments.length === 0 ? (
                <MenuItem disabled>
                  <em>{selectedSchool ? 'No departments available or all have HODs' : 'Please select a school first'}</em>
                </MenuItem>
              ) : (
                filteredDepartments.map((department) => (
                  <MenuItem key={department._id} value={department._id}>
                    {department.name} ({department.code})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select HOD *</InputLabel>
            <Select
              value={selectedHODForAssignment}
              label="Select HOD *"
              onChange={(e) => setSelectedHODForAssignment(e.target.value)}
              disabled={!selectedDepartment}
            >
              {availableHODs.length === 0 ? (
                <MenuItem disabled>
                  <em>{selectedDepartment ? 'No HODs available' : 'Please select a department first'}</em>
                </MenuItem>
              ) : (
                availableHODs.map((hod) => (
                  <MenuItem key={hod._id} value={hod._id}>
                    {hod.name} ({hod.email})
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
            onClick={handleAssignHOD} 
            variant="contained"
            disabled={!selectedDepartment || !selectedHODForAssignment || loading}
            sx={{ 
              background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
              px: 3
            }}
          >
            {loading ? 'Assigning...' : 'Assign HOD'}
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
          background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
          color: 'white',
          py: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <HODIcon />
            {editMode ? 'Edit HOD' : 'Add New HOD'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Name *"
            fullWidth
            variant="outlined"
            value={currentHOD.name}
            onChange={(e) => setCurrentHOD({ ...currentHOD, name: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
            placeholder="Full name"
          />
          <TextField
            margin="dense"
            label="Email *"
            type="email"
            fullWidth
            variant="outlined"
            value={currentHOD.email}
            onChange={(e) => setCurrentHOD({ ...currentHOD, email: e.target.value })}
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
              value={currentHOD.password}
              onChange={(e) => setCurrentHOD({ ...currentHOD, password: e.target.value })}
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
              value={currentHOD.uid}
              onChange={(e) => setCurrentHOD({ ...currentHOD, uid: e.target.value })}
              sx={{ mb: 2 }}
              helperText="5-6 digit numeric UID (e.g., 10001). Leave empty for auto-generation."
              inputProps={{ maxLength: 6 }}
              error={currentHOD.uid && !/^\d{5,6}$/.test(currentHOD.uid)}
            />
          )}
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel>School *</InputLabel>
            <Select
              value={currentHOD.school}
              onChange={(e) => setCurrentHOD({ ...currentHOD, school: e.target.value })}
              label="School *"
              required
            >
              {schools.map((school) => (
                <MenuItem key={school._id} value={school._id}>
                  {school.name} ({school.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel>Department *</InputLabel>
            <Select
              value={currentHOD.department}
              onChange={(e) => setCurrentHOD({ ...currentHOD, department: e.target.value })}
              label="Department *"
              disabled={!currentHOD.school}
              required
            >
              {filteredDepartments.length === 0 ? (
                <MenuItem disabled>
                  <em>Select a school first</em>
                </MenuItem>
              ) : (
                filteredDepartments.map((department) => (
                  <MenuItem key={department._id} value={department._id}>
                    {department.name} ({department.code})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} sx={{ color: '#64748b' }}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={loading || !currentHOD.name || !currentHOD.email || (!editMode && !currentHOD.password)}
            sx={{ 
              background: 'linear-gradient(135deg, #6497b1 0%, #005b96 100%)',
              px: 3
            }}
          >
            {loading ? 'Saving...' : (editMode ? 'Update HOD' : 'Create HOD')}
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

export default HODManagement;
