export type PasswordRequirement = {
  key: string;
  label: string;
  met: boolean;
};

export type PasswordValidationResult = {
  isValid: boolean;
  score: number;
  requirements: PasswordRequirement[];
  errors: string[];
  suggestions: string[];
};

const MIN_LENGTH = 8;
const RULES = [
  {
    key: 'length',
    test: (pwd: string) => pwd.length >= MIN_LENGTH,
    label: `At least ${MIN_LENGTH} characters`,
    error: `Password must be at least ${MIN_LENGTH} characters long.`,
    suggestion: `Use a longer passphrase with at least ${MIN_LENGTH} characters.`,
  },
  {
    key: 'uppercase',
    test: (pwd: string) => /[A-Z]/.test(pwd),
    label: 'Uppercase letter',
    error: 'Include at least one uppercase letter.',
    suggestion: 'Try adding a capital letter (A-Z).',
  },
  {
    key: 'lowercase',
    test: (pwd: string) => /[a-z]/.test(pwd),
    label: 'Lowercase letter',
    error: 'Include at least one lowercase letter.',
    suggestion: 'Try adding a lowercase letter (a-z).',
  },
  {
    key: 'number',
    test: (pwd: string) => /[0-9]/.test(pwd),
    label: 'Number',
    error: 'Include at least one number.',
    suggestion: 'Try adding a numeral (0-9).',
  },
  {
    key: 'special',
    test: (pwd: string) => /[^A-Za-z0-9]/.test(pwd),
    label: 'Special character',
    error: 'Include at least one special character.',
    suggestion: 'Try adding a symbol like !@#$%^&*.',
  },
];

export function validatePassword(password: string): PasswordValidationResult {
  const requirements: PasswordRequirement[] = RULES.map(rule => ({
    key: rule.key,
    label: rule.label,
    met: rule.test(password),
  }));

  const errors = requirements
    .filter(req => !req.met)
    .map(req => {
      const rule = RULES.find(r => r.key === req.key);
      return rule?.error ?? 'Password rule failed.';
    });

  const suggestions = requirements
    .filter(req => !req.met)
    .map(req => RULES.find(r => r.key === req.key)?.suggestion ?? 'Improve your password.');

  const score = Math.round(
    (requirements.filter(req => req.met).length / requirements.length) * 100
  );
  const isValid = errors.length === 0;

  return {
    isValid,
    score,
    requirements,
    errors,
    suggestions,
  };
}

export function getPasswordStrengthLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Strong';
  if (score >= 55) return 'Fair';
  return 'Weak';
}

export function getPasswordStrengthColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 75) return 'text-lime-600';
  if (score >= 55) return 'text-amber-500';
  return 'text-rose-600';
}
