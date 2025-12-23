import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  Alert, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Typography, 
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Divider,
  IconButton,
  Collapse,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import Papa from 'papaparse';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { sanitizeInput, validateInputLength, INPUT_LIMITS } from '../../utils/sanitize';

const REQUIRED_FIELDS = ['name', 'code', 'description'];

// Validation helpers for schools
const validateSchoolCode = (code) => {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'School code is required' };
  }
  const trimmedCode = code.trim().toUpperCase();
  if (trimmedCode.length < 3) {
    return { valid: false, error: 'School code must be at least 3 characters' };
  }
  if (trimmedCode.length > 10) {
    return { valid: false, error: 'School code cannot exceed 10 characters' };
  }
  if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
    return { valid: false, error: 'School code must contain only letters (A-Z) and numbers (0-9). Special characters not allowed.' };
  }
  return { valid: true, error: '' };
};

const validateSchoolName = (name) => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'School name is required' };
  }
  const trimmedName = name.trim();
  if (trimmedName.length < 3) {
    return { valid: false, error: 'School name must be at least 3 characters' };
  }
  if (trimmedName.length > 100) {
    return { valid: false, error: 'School name cannot exceed 100 characters' };
  }
  if (!/^[A-Za-z0-9\s&.,'-]+$/.test(trimmedName)) {
    return { valid: false, error: 'School name contains invalid characters. Only letters, numbers, spaces, and basic punctuation allowed.' };
  }
  return { valid: true, error: '' };
};

// Sanitize CSV row data to prevent XSS and script injection
const sanitizeCSVRow = (row) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(row)) {
    let sanitizedValue = sanitizeInput(String(value || ''));
    // Remove formula injection attempts
    if (/^[=+\-@|]/.test(sanitizedValue)) {
      sanitizedValue = sanitizedValue.substring(1);
    }
    // Apply field-specific length limits
    if (key === 'name') sanitizedValue = validateInputLength(sanitizedValue, 'name');
    if (key === 'code') sanitizedValue = validateInputLength(sanitizedValue, 'code');
    if (key === 'description') sanitizedValue = validateInputLength(sanitizedValue, 'description');
    sanitized[key] = sanitizedValue;
  }
  return sanitized;
};

// Helper function to generate sample CSV content
const generateSampleCSV = () => {
  return `name,code,description
School of Engineering,SOE,Department of Engineering and Technology
School of Management,SOM,School of Business and Management Studies
School of Arts,SOA,School of Liberal Arts and Humanities
School of Law,SOL,School of Legal Studies
School of Science,SOS,School of Pure and Applied Sciences`;
};

// Helper function to download sample CSV
const downloadSampleCSV = () => {
  const element = document.createElement('a');
  const file = new Blob([generateSampleCSV()], {type: 'text/csv'});
  element.href = URL.createObjectURL(file);
  element.download = 'school_bulk_upload_template.csv';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

const BulkUploadSchools = ({ onUpload }) => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const steps = ['Select CSV File', 'Validate Data', 'Create Schools'];

  const handleFileChange = e => {
    setFile(e.target.files[0]);
    setPreview([]);
    setCsvErrors([]);
    setError('');
    setSuccess('');
    setActiveStep(1);
    
    if (e.target.files[0]) {
      Papa.parse(e.target.files[0], {
        header: true,
        skipEmptyLines: true,
        transformHeader: header => header.trim().toLowerCase(),
        complete: (results) => {
          // Sanitize all rows to prevent XSS
          const rows = results.data.map(row => sanitizeCSVRow(row));
          
          // Check if we have the right headers
          const headers = Object.keys(rows[0] || {}).map(h => h.toLowerCase());
          const missingHeaders = REQUIRED_FIELDS.filter(f => !headers.includes(f));
          
          if (missingHeaders.length > 0) {
            setError(`CSV is missing required headers: ${missingHeaders.join(', ')}. Please use the template.`);
            return;
          }
          
          const errors = [];
          
          rows.forEach((row, idx) => {
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
              normalizedRow[key.toLowerCase().trim()] = row[key];
            });
            
            // Check required fields
            if (!normalizedRow.name || normalizedRow.name.trim() === '') {
              errors.push({ row: idx + 2, message: 'Missing field: name' });
            } else {
              const nameValidation = validateSchoolName(normalizedRow.name);
              if (!nameValidation.valid) {
                errors.push({ row: idx + 2, message: `Name: ${nameValidation.error}` });
              }
            }
            
            if (!normalizedRow.code || normalizedRow.code.trim() === '') {
              errors.push({ row: idx + 2, message: 'Missing field: code' });
            } else {
              const codeValidation = validateSchoolCode(normalizedRow.code);
              if (!codeValidation.valid) {
                errors.push({ row: idx + 2, message: `Code: ${codeValidation.error}` });
              }
            }
            
            if (!normalizedRow.description || normalizedRow.description.trim() === '') {
              errors.push({ row: idx + 2, message: 'Missing field: description' });
            }
          });
          
          setPreview(rows);
          setCsvErrors(errors);
          
          if (errors.length === 0) {
            setActiveStep(2);
          }
        },
        error: (err) => setError('CSV parse error: ' + err.message)
      });
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!file) return setError('Please select a CSV file');
    if (csvErrors.length > 0) return setError('Please fix CSV errors before uploading.');
    
    setIsUploading(true);
    
    try {
      const result = await onUpload(file);
      
      // Check if there are partial failures
      if (result?.failed && result.failed.length > 0) {
        const failedErrors = result.failed.map((f, idx) => ({
          row: f.row || idx + 2,
          message: f.reason || f.error || 'Failed to create school'
        }));
        setCsvErrors(failedErrors);
        
        if (result?.created && result.created > 0) {
          setSuccess(`${result.created} schools created successfully. ${result.failed.length} failed - see errors below.`);
        } else {
          setError(`All schools failed to create. See errors below.`);
        }
      } else {
        setSuccess(result?.message || `${result?.created || preview.length} schools created successfully`);
        setFile(null);
        setPreview([]);
        setCsvErrors([]);
        setActiveStep(0);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Bulk school creation failed';
      setError(errorMessage);
      
      // Parse and display detailed errors
      if (err.response?.data?.errors) {
        const detailedErrors = err.response.data.errors.map((e, idx) => ({
          row: e.row || idx + 2,
          message: e.reason || e.error || e.message || 'Validation failed'
        }));
        setCsvErrors(detailedErrors);
      } else if (err.response?.data?.failed) {
        const failedErrors = err.response.data.failed.map((f, idx) => ({
          row: f.row || idx + 2,
          message: f.reason || f.error || 'Failed to create school'
        }));
        setCsvErrors(failedErrors);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const toggleHelp = () => {
    setShowHelp(!showHelp);
  };

  return (
    <Card 
      elevation={3} 
      sx={{ 
        mb: 3, 
        overflow: 'hidden',
        borderRadius: 2,
        background: 'linear-gradient(to bottom, #ffffff, #f8f9fa)'
      }}
    >
      <Box 
        sx={{ 
          background: 'linear-gradient(135deg, #005b96 0%, #03396c 100%)',
          p: 2.5,
          color: 'white'
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            Bulk Upload Schools
          </Typography>
          <Box>
            <IconButton 
              onClick={toggleHelp} 
              size="small"
              sx={{ 
                color: 'white',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' }
              }}
            >
              <HelpOutlineIcon />
            </IconButton>
            <IconButton 
              onClick={toggleExpanded} 
              size="small"
              sx={{ 
                color: 'white',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' }
              }}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      <CardContent sx={{ p: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{success}</Alert>}
        
        <Collapse in={showHelp}>
          <Alert 
            severity="info" 
            sx={{ 
              mb: 3, 
              borderRadius: 2,
              backgroundColor: '#e8f4fc',
              border: '1px solid #6497b1'
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              How to use:
            </Typography>
            <Typography variant="body2" component="div" sx={{ lineHeight: 1.8 }}>
              <Box component="ol" sx={{ pl: 2, m: 0 }}>
                <li>Download the CSV template</li>
                <li>Fill in school name, code, and description</li>
                <li>Upload the CSV file</li>
                <li>Review validation and fix errors</li>
                <li>Submit to create schools in bulk</li>
              </Box>
            </Typography>
          </Alert>
        </Collapse>

        <Stepper 
          activeStep={activeStep} 
          sx={{ 
            mb: 4,
            '& .MuiStepLabel-label': {
              fontWeight: 500
            }
          }}
        >
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        <Grid container spacing={2.5} alignItems="center">
          <Grid item xs={12} md={4}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadSampleCSV}
              fullWidth
              sx={{ 
                py: 1.5,
                fontWeight: 600,
                borderWidth: 2,
                borderColor: '#005b96',
                color: '#005b96',
                '&:hover': {
                  borderWidth: 2,
                  borderColor: '#03396c',
                  backgroundColor: 'rgba(103, 58, 183, 0.04)'
                }
              }}
            >
              Download Template
            </Button>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="csv-file-upload-schools"
            />
            <label htmlFor="csv-file-upload-schools" style={{ width: '100%' }}>
              <Button 
                variant="outlined" 
                component="span"
                startIcon={<CloudUploadIcon />}
                fullWidth
                sx={{ 
                  py: 1.5,
                  fontWeight: 600,
                  borderWidth: 2,
                  borderColor: '#005b96',
                  color: '#005b96',
                  '&:hover': {
                    borderWidth: 2,
                    borderColor: '#03396c',
                    backgroundColor: 'rgba(103, 58, 183, 0.04)'
                  }
                }}
              >
                Select CSV File
              </Button>
            </label>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Button 
              type="submit" 
              variant="contained" 
              onClick={handleSubmit}
              disabled={csvErrors.length > 0 || !file || isUploading}
              fullWidth
              sx={{ 
                py: 1.5,
                fontWeight: 600,
                boxShadow: 3,
                backgroundColor: '#005b96',
                '&:hover': {
                  backgroundColor: '#03396c',
                  boxShadow: 6
                }
              }}
            >
              Create Schools
            </Button>
          </Grid>
        </Grid>
        
        {file && (
          <Box 
            sx={{ 
              mt: 2.5, 
              p: 2, 
              backgroundColor: '#f5f5f5', 
              borderRadius: 2,
              border: '1px solid #e0e0e0'
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Selected file: <strong style={{ color: '#005b96' }}>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </Typography>
          </Box>
        )}
        
        {isUploading && (
          <Box sx={{ mt: 3 }}>
            <LinearProgress sx={{ borderRadius: 1, height: 6, backgroundColor: '#b3cde0', '& .MuiLinearProgress-bar': { backgroundColor: '#005b96' } }} />
            <Typography variant="body2" sx={{ mt: 1.5, textAlign: 'center', fontWeight: 500, color: '#005b96' }}>
              Creating schools...
            </Typography>
          </Box>
        )}
      </CardContent>
      
      <Collapse in={expanded}>
        <Divider />
        <CardContent sx={{ backgroundColor: '#fafafa', p: 3 }}>
          {preview.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#005b96' }}>
                Preview ({preview.length} schools)
              </Typography>
              <TableContainer 
                component={Paper} 
                sx={{ 
                  maxHeight: 300,
                  borderRadius: 2,
                  boxShadow: 2
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, backgroundColor: '#005b96', color: 'white' }}>Row</TableCell>
                      {Object.keys(preview[0]).map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, backgroundColor: '#005b96', color: 'white', textTransform: 'capitalize' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow 
                        key={i} 
                        hover
                        sx={{ 
                          '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{i + 2}</TableCell>
                        {Object.keys(preview[0]).map(h => (
                          <TableCell key={h}>{row[h]}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {csvErrors.length > 0 && (
                <Alert 
                  severity="error" 
                  sx={{ 
                    mt: 3,
                    borderRadius: 2,
                    border: '1px solid #f44336'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    CSV Validation Errors:
                  </Typography>
                  <TableContainer 
                    component={Paper} 
                    sx={{ 
                      maxHeight: 200, 
                      mt: 1.5,
                      borderRadius: 1
                    }}
                  >
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#ffebee' }}>Row</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#ffebee' }}>Error</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {csvErrors.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell sx={{ fontWeight: 600 }}>{e.row}</TableCell>
                            <TableCell>{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Alert>
              )}
            </Box>
          )}
          
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#005b96' }}>
              Required CSV Format
            </Typography>
            <TableContainer 
              component={Paper} 
              sx={{ 
                maxWidth: 700,
                borderRadius: 2,
                boxShadow: 2
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, backgroundColor: '#005b96', color: 'white' }}>Field</TableCell>
                    <TableCell sx={{ fontWeight: 700, backgroundColor: '#005b96', color: 'white' }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, backgroundColor: '#005b96', color: 'white' }}>Example</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow sx={{ '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' } }}>
                    <TableCell sx={{ fontWeight: 600 }}>name</TableCell>
                    <TableCell>School name (required, 3-100 chars, letters/numbers/spaces only)</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#005b96' }}>School of Engineering</TableCell>
                  </TableRow>
                  <TableRow sx={{ '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' } }}>
                    <TableCell sx={{ fontWeight: 600 }}>code</TableCell>
                    <TableCell>School code (required, 3-10 chars, A-Z/0-9 only, unique)</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#005b96' }}>SOE, SOM, SOA</TableCell>
                  </TableRow>
                  <TableRow sx={{ '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' } }}>
                    <TableCell sx={{ fontWeight: 600 }}>description</TableCell>
                    <TableCell>School description (required)</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#005b96' }}>School of Engineering and Technology</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            
            <Alert 
              severity="info" 
              sx={{ 
                mt: 3,
                borderRadius: 2,
                backgroundColor: '#e3f2fd',
                border: '1px solid #90caf9'
              }}
            >
              <Typography variant="body2" sx={{ lineHeight: 1.8 }}>
                <strong>Note:</strong> School codes must be unique. Use 3-10 alphanumeric characters (A-Z, 0-9). 
                Special characters are not allowed. After creating schools, you can add departments and assign deans.
              </Typography>
            </Alert>
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default BulkUploadSchools;
