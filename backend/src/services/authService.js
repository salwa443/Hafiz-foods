import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  createStaffUser,
  findUserByEmail,
  findUserById,
} from '../models/userModel.js';

function getJwtSecret() {
  if (!env.jwtSecret || env.jwtSecret === 'replace_with_a_secure_secret') {
    const error = new Error('JWT secret is not configured securely.');
    error.statusCode = 500;
    throw error;
  }

  return env.jwtSecret;
}

export function buildPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: env.jwtExpiresIn }
  );
}

export async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await findUserById(payload.sub);

    if (!user || !user.is_active) {
      const error = new Error('Authentication token is no longer valid.');
      error.statusCode = 401;
      throw error;
    }

    return user;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const expiredError = new Error('Authentication token has expired. Please log in again.');
      expiredError.statusCode = 401;
      throw expiredError;
    }

    if (error.name === 'JsonWebTokenError') {
      const invalidError = new Error('Invalid authentication token.');
      invalidError.statusCode = 401;
      throw invalidError;
    }

    throw error;
  }
}

export async function loginStaff({ email, password }) {
  const user = await findUserByEmail(email.toLowerCase());

  if (!user || !user.is_active) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user);

  return {
    token,
    user: buildPublicUser(user),
  };
}

export async function registerStaff({ name, email, password, role }) {
  const existingUser = await findUserByEmail(email.toLowerCase());

  if (existingUser) {
    const error = new Error('A staff user with this email already exists.');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createStaffUser({
    name,
    email: email.toLowerCase(),
    passwordHash,
    roleName: role,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
  };
}
