import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { formatTableDisplayLabel } from '../utils/tableDisplayLabel.js';

const qrOptions = {
  errorCorrectionLevel: 'H',
  margin: 4,
  type: 'png',
  width: 1024,
};

function getFrontendBaseUrl() {
  return env.frontendUrl.replace(/\/+$/, '');
}

export function buildTableQrUrl(table) {
  const qrPath = table.qr_code_data || `/menu/${encodeURIComponent(table.table_number)}/${encodeURIComponent(table.qr_token)}`;

  return `${getFrontendBaseUrl()}${qrPath.startsWith('/') ? qrPath : `/${qrPath}`}`;
}

export async function generateTableQrPngBuffer(table) {
  return QRCode.toBuffer(buildTableQrUrl(table), qrOptions);
}

export async function generateTableQrDataUrl(table) {
  return QRCode.toDataURL(buildTableQrUrl(table), qrOptions);
}

export function buildTableQrInfo(table) {
  const qrUrl = buildTableQrUrl(table);

  return {
    tableId: table.id,
    tableNumber: table.table_number,
    tableDisplayLabel: formatTableDisplayLabel(table.table_number, table.id),
    qrPath: table.qr_code_data,
    qrToken: table.qr_token,
    qrUrl,
    status: table.status,
    isActive: table.is_active,
  };
}
