import { z } from 'zod';

export const emailRule = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const passwordRule =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,128}$/;

export const roleRule = z.enum(['admin', 'user']);

export const createUserInputRule = z.object({
  email: z.string().regex(emailRule, 'email inválido'),
  password: z.string().regex(passwordRule, 'senha: 8+ chars, com maiúscula, minúscula e dígito'),
  role: roleRule,
});

export type CreateUserInput = z.infer<typeof createUserInputRule>;

export const updateUserInputRule = z.object({
  role: roleRule.optional(),
  active: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserInputRule>;

export const resetPasswordRule = z.object({
  newPassword: z.string().regex(passwordRule, 'senha: 8+ chars, com maiúscula, minúscula e dígito'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordRule>;
