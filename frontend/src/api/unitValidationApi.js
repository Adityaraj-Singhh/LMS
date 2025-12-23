import axios from 'axios';

// Get units that need revalidation for current student
export const getUnitsNeedingReview = async (courseId, token) => {
  const res = await axios.get(`/api/unit-validation/course/${courseId}/units-needing-review`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Get progression blocking information for current student
export const getProgressionStatus = async (courseId, token) => {
  const res = await axios.get(`/api/unit-validation/course/${courseId}/progression-status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Validate access to specific unit
export const validateUnitAccess = async (courseId, unitId, token) => {
  const res = await axios.get(`/api/unit-validation/course/${courseId}/unit/${unitId}/validate-access`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Check if unit revalidation is complete
export const checkUnitCompletion = async (courseId, unitId, token) => {
  const res = await axios.post(`/api/unit-validation/course/${courseId}/unit/${unitId}/check-completion`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Admin: Get content change impact analysis
export const getContentChangeImpactAnalysis = async (courseId, unitId = null, token) => {
  const params = unitId ? `?unitId=${unitId}` : '';
  const res = await axios.get(`/api/unit-validation/admin/course/${courseId}/impact-analysis${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Get signed URL with validation (enhanced error handling)
export const getVideoSignedUrlWithValidation = async (videoId, token) => {
  try {
    const res = await axios.get(`/api/videos/${videoId}/signed-url`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  } catch (error) {
    if (error.response?.status === 403 && error.response?.data?.reason === 'unit_blocked') {
      throw {
        type: 'PROGRESSION_BLOCKED',
        message: error.response.data.message,
        blockedBy: error.response.data.blockedBy,
        contentInfo: error.response.data.contentInfo
      };
    }
    throw error;
  }
};

// Get reading material signed URL with validation
export const getReadingMaterialSignedUrlWithValidation = async (materialId, token) => {
  try {
    const res = await axios.get(`/api/reading-materials/${materialId}/signed-url`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  } catch (error) {
    if (error.response?.status === 403 && error.response?.data?.reason === 'unit_blocked') {
      throw {
        type: 'PROGRESSION_BLOCKED',
        message: error.response.data.message,
        blockedBy: error.response.data.blockedBy,
        contentInfo: error.response.data.contentInfo
      };
    }
    throw error;
  }
};

export default {
  getUnitsNeedingReview,
  getProgressionStatus,
  validateUnitAccess,
  checkUnitCompletion,
  getContentChangeImpactAnalysis,
  getVideoSignedUrlWithValidation,
  getReadingMaterialSignedUrlWithValidation
};