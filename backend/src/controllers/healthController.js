export function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'QR Menu backend is running',
    timestamp: new Date().toISOString(),
  });
}
