import {
  buildPublicUser,
  loginStaff,
  registerStaff,
} from '../services/authService.js';

export async function login(req, res, next) {
  try {
    const result = await loginStaff(req.body);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export function getMe(req, res) {
  res.status(200).json({
    success: true,
    data: {
      user: buildPublicUser(req.user),
    },
  });
}

export function logout(req, res) {
  res.status(200).json({
    success: true,
    message: 'Logout successful. Please remove the token on the client.',
  });
}

export async function register(req, res, next) {
  try {
    const user = await registerStaff(req.body);

    res.status(201).json({
      success: true,
      message: 'Staff user registered successfully.',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}
