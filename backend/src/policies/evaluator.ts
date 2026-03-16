import { PolicyCondition } from './schemas/policy.schema';

function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function evaluateCondition(
  condition: PolicyCondition,
  context: Record<string, any>,
): boolean {
  const actual = getNestedValue(context, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'contains':
      if (typeof actual === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    default:
      return false;
  }
}

export function evaluateConditions(
  conditions: PolicyCondition[],
  context: Record<string, any>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, context));
}
