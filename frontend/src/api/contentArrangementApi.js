import axios from 'axios';

// Get content arrangement for CC to manage
export const getContentArrangement = async (courseId, token) => {
  const res = await axios.get(`/api/content-arrangement/course/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Update content arrangement (CC rearranges content)
export const updateContentArrangement = async (arrangementId, items, token) => {
  const res = await axios.put(`/api/content-arrangement/${arrangementId}`, 
    { items },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.data;
};

// Submit arrangement for HOD approval
export const submitArrangement = async (arrangementId, token) => {
  const res = await axios.post(`/api/content-arrangement/${arrangementId}/submit`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Get pending arrangements for HOD approval
export const getPendingArrangements = async (token) => {
  const res = await axios.get('/api/content-arrangement/pending', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Review arrangement (HOD approve/reject)
export const reviewArrangement = async (arrangementId, action, reason, token) => {
  const res = await axios.post(`/api/content-arrangement/${arrangementId}/review`, 
    { action, reason },
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  return res.data;
};

// Get arrangement history for a course
export const getArrangementHistory = async (courseId, token) => {
  const res = await axios.get(`/api/content-arrangement/${courseId}/history`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Launch course (HOD action)
export const launchCourse = async (courseId, token) => {
  const res = await axios.post(`/api/content-arrangement/course/${courseId}/launch`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Mark course content as updated (Admin action)
export const markCourseContentUpdated = async (courseId, token) => {
  const res = await axios.post(`/api/content-arrangement/course/${courseId}/mark-updated`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};