const path = require('node:path');
const { env } = require('../env');
const { query } = require('../db');
const { errorWithStatus } = require('../lib/utils');
const { FILE_ACCEPT_RULES } = require('../lib/constants');

function configuredMaterialSchema(step) {
  if (step.taskMeta?.materialSchema?.length) return step.taskMeta.materialSchema;
  return step.materialSchema || [];
}

function fileUrl(fileName) {
  const publicBase = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return /(^|_)uploads$/i.test(publicBase) || /\/uploads$/i.test(publicBase)
    ? `${publicBase}/${fileName}`
    : `${publicBase}/uploads/${fileName}`;
}

function acceptedTypesForMaterial(step, materialTag) {
  const material = configuredMaterialSchema(step).find((item) => item.tag === materialTag);
  if (!material) throw errorWithStatus('材料类型不属于当前步骤', 400);
  return material.accept || [];
}

function validateUploadedFile(file, acceptTypes) {
  if (!file) throw errorWithStatus('未上传文件', 400);
  const extension = path.extname(file.originalname || '').toLowerCase();
  const allowed = acceptTypes.flatMap((type) => {
    const rule = FILE_ACCEPT_RULES[type] || { extensions: [], mimeTypes: [] };
    return rule.extensions.map((item) => ({ extension: item, mimeTypes: rule.mimeTypes }));
  });
  if (!allowed.length) return;
  const extensionAllowed = allowed.some((item) => item.extension === extension);
  const mimeAllowed = acceptTypes.some((type) => (FILE_ACCEPT_RULES[type]?.mimeTypes || []).includes(file.mimetype));
  if (!extensionAllowed || !mimeAllowed) {
    throw errorWithStatus('上传文件类型不符合当前材料要求', 400);
  }
}

async function validateRequiredMaterials(step) {
  const requiredMaterials = configuredMaterialSchema(step).filter((item) => item.required);
  if (!requiredMaterials.length) return;
  const rows = await query(
    `SELECT material_tag AS materialTag, file_name AS fileName, mime_type AS mimeType
     FROM attachments
     WHERE step_record_id = :stepRecordId`,
    { stepRecordId: step.id },
  );
  for (const material of requiredMaterials) {
    const matched = rows.filter((item) => item.materialTag === material.tag);
    if (!matched.length) {
      throw errorWithStatus(`请上传${material.label}`, 400);
    }
    const acceptedRules = material.accept || [];
    if (acceptedRules.length) {
      for (const item of matched) {
        const extension = path.extname(item.fileName || '').toLowerCase();
        const extensionAllowed = acceptedRules.some((type) => (FILE_ACCEPT_RULES[type]?.extensions || []).includes(extension));
        const mimeAllowed = acceptedRules.some((type) => (FILE_ACCEPT_RULES[type]?.mimeTypes || []).includes(item.mimeType));
        if (!extensionAllowed || !mimeAllowed) {
          throw errorWithStatus(`${material.label}文件类型不符合要求`, 400);
        }
      }
    }
  }
}

module.exports = {
  configuredMaterialSchema,
  fileUrl,
  acceptedTypesForMaterial,
  validateUploadedFile,
  validateRequiredMaterials,
};
