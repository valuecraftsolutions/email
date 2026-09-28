export const sendSuccess = (res, data = {}, status = 200) =>
  res.status(status).json({ success: true, data });

export const sendError = (res, status, error) =>
  res.status(status).json({ success: false, error });
