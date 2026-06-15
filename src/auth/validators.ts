import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'min 8 chars')
  .max(128, 'max 128 chars')
  .regex(/[a-z]/, 'must contain a lowercase letter')
  .regex(/[A-Z]/, 'must contain an uppercase letter')
  .regex(/[0-9]/, 'must contain a digit');

export const emailSchema = z.string().email('invalid email');

export const roleSchema = z.enum(['admin', 'user']);

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});
