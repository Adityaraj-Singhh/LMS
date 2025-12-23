import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  CardActions, 
  Button, 
  CircularProgress, 
  Box,
  LinearProgress,
  Divider,
  Breadcrumbs,
  Link,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Link as RouterLink } from 'react-router-dom';
import axios from 'axios';

const StudentCoursesPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/student/courses', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('📚 Student courses response:', response.data);
        
        // Process courses to ensure _id is always a string
        const processedCourses = response.data.map(course => ({
          ...course,
          _id: course._id?.toString() || course._id
        }));
        
        // Log each course ID to check if any are objects
        processedCourses.forEach((course, index) => {
          console.log(`Course ${index}:`, {
            _id: course._id,
            _idType: typeof course._id,
            title: course.title,
            originalId: response.data[index]._id,
            originalIdType: typeof response.data[index]._id
          });
        });
        
        setCourses(processedCourses);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching courses:', err);
        setError('Failed to load courses. Please try again.');
        setLoading(false);
      }
    };
    
    if (token) {
      fetchCourses();
    }
  }, [token]);
  
  const formatDuration = (seconds) => {
    if (!seconds) return '0m';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/student" color="inherit">
          Dashboard
        </Link>
        <Typography color="text.primary">My Courses</Typography>
      </Breadcrumbs>
      
      <Typography variant="h4" gutterBottom>
        My Courses
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : courses.length === 0 ? (
        <Typography variant="body1">
          You don't have any courses assigned yet. Please contact your administrator.
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {courses.map((course) => (
            <Grid item xs={12} sm={6} md={4} key={course._id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h5" component="h2" gutterBottom>
                    {course.title}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Course Code: {course.courseCode}
                  </Typography>
                  
                  <Divider sx={{ my: 1.5 }} />
                  
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Progress:
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: '100%', mr: 1 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={course.progress || 0} 
                        sx={{ height: 8, borderRadius: 5 }}
                      />
                    </Box>
                    <Box sx={{ minWidth: 35 }}>
                      <Typography variant="body2" color="text.secondary">
                        {`${course.progress || 0}%`}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      <strong>Videos:</strong> {course.videoCount || course.totalVideos || 0}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Videos Started:</strong> {course.videosStarted || 0}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Total Duration:</strong> {course.totalDuration > 0 ? formatDuration(course.totalDuration) : 'Not calculated'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Teacher:</strong> {course.teacherName || 'Not assigned'}
                    </Typography>
                  </Box>
                </CardContent>
                
                <CardActions>
                  <Button 
                    size="small" 
                    color="primary"
                    onClick={() => {
                      // Ensure we have a valid course ID
                      let courseId = course._id;
                      
                      // Handle different ID formats
                      if (typeof courseId === 'object' && courseId !== null) {
                        // If it's an object, try to get the string representation
                        courseId = courseId.toString();
                      } else if (typeof courseId === 'string') {
                        // Already a string, good
                        courseId = courseId;
                      } else {
                        console.error('Invalid course ID format:', courseId, typeof courseId);
                        alert('Error: Invalid course ID. Please refresh the page and try again.');
                        return;
                      }
                      
                      console.log('🎬 Navigating to videos for course:', {
                        originalId: course._id,
                        processedId: courseId,
                        courseTitle: course.title
                      });
                      
                      // Validate the courseId before navigation
                      if (courseId && courseId !== '[object Object]' && courseId.length > 0) {
                        navigate(`/student/course/${courseId}/units`);
                      } else {
                        console.error('Cannot navigate with invalid course ID:', courseId);
                        alert('Error: Cannot access course content. Invalid course ID.');
                      }
                    }}
                  >
                    View Content
                  </Button>
                  <Button 
                    size="small" 
                    color="secondary"
                    onClick={() => {
                      // Ensure we have a valid course ID
                      let courseId = course._id;
                      
                      // Handle different ID formats
                      if (typeof courseId === 'object' && courseId !== null) {
                        // If it's an object, try to get the string representation
                        courseId = courseId.toString();
                      } else if (typeof courseId === 'string') {
                        // Already a string, good
                        courseId = courseId;
                      } else {
                        console.error('Invalid course ID format:', courseId, typeof courseId);
                        alert('Error: Invalid course ID. Please refresh the page and try again.');
                        return;
                      }
                      
                      console.log('📊 Navigating to progress for course:', {
                        originalId: course._id,
                        processedId: courseId,
                        courseTitle: course.title
                      });
                      
                      // Validate the courseId before navigation
                      if (courseId && courseId !== '[object Object]' && courseId.length > 0) {
                        navigate(`/student/course/${courseId}/progress`);
                      } else {
                        console.error('Cannot navigate with invalid course ID:', courseId);
                        alert('Error: Cannot access course progress. Invalid course ID.');
                      }
                    }}
                  >
                    View Progress
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default StudentCoursesPage;
