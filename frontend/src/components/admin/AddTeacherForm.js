import React, { useState, useEffect } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Alert, 
  MenuItem, 
  Select, 
  FormControl, 
  InputLabel,
  LinearProgress,
  Typography
} from '@mui/material';
import axios from 'axios';
import {
  validateEmail,
  validatePassword,
  validateName,
  validateUID,
  validateSelect,
  hasFieldError,
  getFieldError
} from '../../utils/validation';

const AddTeacherForm = ({ onAdd }) => {

  const [form, setForm] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    school: '',
    department: '',
    uid: '' // Optional: 5-6 digit staff UID
  });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [touched, setTouched] = useState({});
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filteredDepartments, setFilteredDepartments] = useState([]);
  const [passwordStrength, setPasswordStrength] = useState('none');

  const token = localStorage.getItem('token');

  // Fetch schools, departments, and sections on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching teacher form data...');
        console.log('Making API calls to fetch schools, departments, sections...');
        
        const schoolsPromise = axios.get('/api/schools', { headers: { Authorization: `Bearer ${token}` } });
        const departmentsPromise = axios.get('/api/departments', { headers: { Authorization: `Bearer ${token}` } });

        const [schoolsRes, departmentsRes] = await Promise.all([
          schoolsPromise.catch(err => {
            console.error('Schools API failed:', err);
            return { data: [] };
          }),
          departmentsPromise.catch(err => {
            console.error('Departments API failed:', err);
            return { data: [] };
          })
        ]);
        
        console.log('Schools data:', schoolsRes.data);
        console.log('Departments data:', departmentsRes.data);
        
        // Safely set the data with fallbacks
        setSchools(Array.isArray(schoolsRes.data) ? schoolsRes.data : []);
        setDepartments(Array.isArray(departmentsRes.data) ? departmentsRes.data : []);
      } catch (err) {
        console.error('Error fetching data:', err);
        console.error('Error details:', err.response?.data);
      }
    };
    fetchData();
  }, [token]);

  // Filter departments when school changes
  useEffect(() => {
    if (form.school && Array.isArray(departments)) {
      const filtered = departments.filter(dept => 
        dept && dept.school && dept.school._id === form.school
      );
      setFilteredDepartments(filtered);
      
      // Reset department if it doesn't belong to selected school
      if (form.department && !filtered.find(d => d && d._id === form.department)) {
        setForm(prev => ({ ...prev, department: '' }));
      }
    } else {
      setFilteredDepartments([]);
      setForm(prev => ({ ...prev, department: '' }));
    }
  }, [form.school, departments]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    setTouched({ ...touched, [name]: true });
    
    // Real-time validation
    validateField(name, value);
    
    // Password strength indicator
    if (name === 'password') {
      if (value.length === 0) {
        setPasswordStrength('none');
      } else if (value.length < 6) {
        setPasswordStrength('weak');
      } else if (value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value)) {
        setPasswordStrength('strong');
      } else {
        setPasswordStrength('medium');
      }
    }
  };

  const validateField = (fieldName, value) => {
    let error = '';
    
    switch (fieldName) {
      case 'name':
        error = validateName(value);
        break;
      case 'email':
        error = validateEmail(value);
        break;
      case 'password':
        error = validatePassword(value, 6);
        break;
      case 'uid':
        error = validateUID(value, false);
        break;
      case 'school':
        error = validateSelect(value, 'School');
        break;
      case 'department':
        error = validateSelect(value, 'Department');
        break;
      default:
        break;
    }
    
    setErrors(prev => ({ ...prev, [fieldName]: error }));
    return error;
  };

  const validateAll = () => {
    const newErrors = {};
    newErrors.name = validateName(form.name);
    newErrors.email = validateEmail(form.email);
    newErrors.password = validatePassword(form.password, 6);
    newErrors.uid = validateUID(form.uid, false);
    newErrors.school = validateSelect(form.school, 'School');
    newErrors.department = validateSelect(form.department, 'Department');
    
    setErrors(newErrors);
    
    // Return true if no errors
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setErrors({});
    setSuccess('');
    
    // Mark all fields as touched
    const allTouched = Object.keys(form).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(allTouched);
    
    // Validate all fields
    if (!validateAll()) {
      return;
    }
    
    try {
      await onAdd(form);
      setSuccess('Teacher added successfully');
      setForm({ name: '', email: '', password: '', school: '', department: '', uid: '' });
      setTouched({});
      setPasswordStrength('none');
      setErrors({});
    } catch (err) {
      setErrors({ submit: err.response?.data?.message || err.message || 'Failed to add teacher' });
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 2 }}>
      {errors.submit && <Alert severity="error" sx={{ mb: 2 }}>{errors.submit}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>UID:</strong> You can optionally provide a 5-6 digit UID (e.g., 10001). If left empty, one will be auto-generated.
        <br />
        Teachers are assigned to school and department. Section and course assignments should be done separately via the Section-Course-Teacher relationship.
      </Alert>
      <TextField
        label="Name *"
        name="name"
        value={form.name}
        onChange={handleChange}
        onBlur={() => setTouched({ ...touched, name: true })}
        fullWidth
        margin="normal"
        required
        error={hasFieldError(touched, errors, 'name')}
        helperText={getFieldError(touched, errors, 'name') || 'Enter the full name of the teacher'}
      />
      <TextField
        label="Email *"
        name="email"
        type="email"
        value={form.email}
        onChange={handleChange}
        onBlur={() => setTouched({ ...touched, email: true })}
        fullWidth
        margin="normal"
        required
        error={hasFieldError(touched, errors, 'email')}
        helperText={getFieldError(touched, errors, 'email') || 'Enter a valid email address'}
      />
      <TextField
        label="Password *"
        name="password"
        value={form.password}
        onChange={handleChange}
        onBlur={() => setTouched({ ...touched, password: true })}
        type="password"
        fullWidth
        margin="normal"
        required
        error={hasFieldError(touched, errors, 'password')}
        helperText={getFieldError(touched, errors, 'password') || 'Password must be at least 6 characters'}
      />
      {passwordStrength !== 'none' && (
        <Box sx={{ mt: 1, mb: 2 }}>
          <Typography variant="caption" sx={{ 
            color: passwordStrength === 'strong' ? 'success.main' : 
                   passwordStrength === 'medium' ? 'warning.main' : 'error.main'
          }}>
            Password strength: {passwordStrength.toUpperCase()}
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={passwordStrength === 'strong' ? 100 : passwordStrength === 'medium' ? 66 : 33}
            sx={{ 
              height: 4, 
              borderRadius: 2,
              backgroundColor: 'grey.300',
              '& .MuiLinearProgress-bar': {
                backgroundColor: passwordStrength === 'strong' ? 'success.main' : 
                               passwordStrength === 'medium' ? 'warning.main' : 'error.main'
              }
            }}
          />
        </Box>
      )}
      <TextField
        label="UID (Optional)"
        name="uid"
        value={form.uid}
        onChange={handleChange}
        onBlur={() => setTouched({ ...touched, uid: true })}
        fullWidth
        margin="normal"
        error={hasFieldError(touched, errors, 'uid')}
        helperText={getFieldError(touched, errors, 'uid') || '5-6 digit numeric UID (e.g., 10001). Leave empty for auto-generation.'}
        inputProps={{ maxLength: 6 }}
      />
      
      <FormControl fullWidth margin="normal" required error={hasFieldError(touched, errors, 'school')}>
        <InputLabel>School *</InputLabel>
        <Select
          name="school"
          value={form.school}
          onChange={handleChange}
          label="School"
        >
          {Array.isArray(schools) && schools.length === 0 ? (
            <MenuItem disabled>
              <em>No schools available</em>
            </MenuItem>
          ) : (
            Array.isArray(schools) && schools.map(school => (
              school && school._id && school.name && school.code ? (
                <MenuItem key={school._id} value={school._id}>
                  {school.name} ({school.code})
                </MenuItem>
              ) : null
            ))
          )}
        </Select>
        {hasFieldError(touched, errors, 'school') && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {getFieldError(touched, errors, 'school')}
          </Typography>
        )}
      </FormControl>

      <FormControl fullWidth margin="normal" required error={hasFieldError(touched, errors, 'department')} disabled={!form.school}>
        <InputLabel>Department *</InputLabel>
        <Select
          name="department"
          value={form.department}
          onChange={handleChange}
          label="Department"
        >
          <MenuItem value="">
            <em>Select Department</em>
          </MenuItem>
          {Array.isArray(filteredDepartments) && filteredDepartments.map(dept => (
            dept && dept._id && dept.name && dept.code ? (
              <MenuItem key={dept._id} value={dept._id}>
                {dept.name} ({dept.code})
              </MenuItem>
            ) : null
          ))}
        </Select>
        {hasFieldError(touched, errors, 'department') && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
            {getFieldError(touched, errors, 'department')}
          </Typography>
        )}
      </FormControl>
      
      <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }} fullWidth>
        Add Teacher
      </Button>
    </Box>
  );
};

export default AddTeacherForm;