export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  key: string;
  message: string;
  type: 'missing' | 'invalid' | 'schema';
}

export interface ValidationWarning {
  key: string;
  message: string;
  type: 'empty' | 'format' | 'suggestion';
}

export interface SecretMatch {
  pattern: string;
  key: string;
  value: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
}

export interface GitHistoryMatch {
  commit: string;
  file: string;
  matches: SecretMatch[];
  date: string;
  author: string;
}

export interface EnvVariable {
  key: string;
  value: string;
  line: number;
  hasComment?: boolean;
  comment?: string;
}

export interface SchemaDefinition {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'url' | 'email';
    pattern?: RegExp;
    default?: string;
    description?: string;
  };
}
