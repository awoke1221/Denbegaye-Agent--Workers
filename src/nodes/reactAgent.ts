import { HumanMessage } from "@langchain/core/messages";
import { llmFactory } from "../utils/llmFactory";

const EXPECTED_REACT_KEYS = [
  "thought",
  "action",
  "actionInput",
  "finalAnswer",
] as const;

type ReActResponse = {
  thought: any;
  action: any;
  actionInput: any;
  finalAnswer: any;
  params?: any;
  actions?: any[];
};

const isObject = (value: any): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const parseJsonSafe = (text: string): any | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const hasExpectedReActKey = (value: any): boolean =>
  isObject(value) &&
  EXPECTED_REACT_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );

const cleanCodeFenceContent = (block: string): string =>
  block
    .replace(/^```[^\n]*\n?/, "")
    .replace(/```$/, "")
    .trim();

const extractCodeFenceBlocks = (raw: string): string[] => {
  const blocks: string[] = [];
  const fenceRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null = null;

  while ((match = fenceRegex.exec(raw)) !== null) {
    blocks.push(cleanCodeFenceContent(match[0]));
  }

  return blocks;
};

const extractBraceDelimitedBlocks = (raw: string): string[] => {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          blocks.push(raw.slice(start, index + 1));
          start = -1;
        }
      }
    }
  }

  return blocks;
};

const extractJsonObjectFromIndex = (
  raw: string,
  startIndex: number,
): string | null => {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const extractJsonArrayFromIndex = (
  raw: string,
  startIndex: number,
): string | null => {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const extractStringOrNull = (
  raw: string,
  key: string,
): string | null | undefined => {
  const regex = new RegExp(
    `"${key}"\\s*:\\s*(null|"(?:[^"\\\\]|\\\\.)*")`,
    "i",
  );
  const match = regex.exec(raw);
  if (!match) {
    return undefined;
  }

  if (match[1].toLowerCase() === "null") {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const extractReActJSON = (raw: string): ReActResponse | null => {
  const trimmed = raw.trim();

  // Step one — strip markdown code fences.
  for (const block of extractCodeFenceBlocks(trimmed)) {
    const parsed = parseJsonSafe(block);
    if (hasExpectedReActKey(parsed)) {
      return parsed;
    }
  }

  // Step two — direct parse.
  const direct = parseJsonSafe(trimmed);
  if (hasExpectedReActKey(direct)) {
    return direct;
  }

  // Step three — largest brace extraction.
  const braceBlocks = extractBraceDelimitedBlocks(raw);
  let bestMatch: ReActResponse | null = null;
  let bestKeyCount = 0;

  for (const block of braceBlocks) {
    const parsed = parseJsonSafe(block);
    if (!hasExpectedReActKey(parsed)) {
      continue;
    }

    const keyCount = EXPECTED_REACT_KEYS.reduce(
      (count, key) =>
        count + (parsed[key] !== undefined && parsed[key] !== null ? 1 : 0),
      0,
    );

    if (keyCount > bestKeyCount) {
      bestKeyCount = keyCount;
      bestMatch = parsed;
    }

    if (bestKeyCount === EXPECTED_REACT_KEYS.length) {
      break;
    }
  }

  if (bestMatch !== null) {
    return bestMatch;
  }

  // Step four — key-by-key extraction.
  const extracted: Partial<ReActResponse> = {};
  const thought = extractStringOrNull(raw, "thought");
  const action = extractStringOrNull(raw, "action");
  const finalAnswer = extractStringOrNull(raw, "finalAnswer");
  let actionInput: any = undefined;

  const actionInputRegex = /"actionInput"\s*:\s*(null|\{)/i;
  const actionInputMatch = actionInputRegex.exec(raw);
  if (actionInputMatch) {
    if (actionInputMatch[1].toLowerCase() === "null") {
      actionInput = null;
    } else {
      const objectStart =
        actionInputMatch.index + actionInputMatch[0].length - 1;
      const objectText = extractJsonObjectFromIndex(raw, objectStart);
      if (objectText !== null) {
        actionInput = parseJsonSafe(objectText);
      }
    }
  }

  if (actionInput === undefined) {
    const quotedInputRegex = /"actionInput"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/i;
    const quotedMatch = quotedInputRegex.exec(raw);
    if (quotedMatch) {
      try {
        actionInput = JSON.parse(`"${quotedMatch[1]}"`);
      } catch {
        actionInput = quotedMatch[1];
      }
    }
  }

  if (thought !== undefined) {
    extracted.thought = thought;
  }
  if (action !== undefined) {
    extracted.action = action;
  }
  if (actionInput !== undefined) {
    extracted.actionInput = actionInput;
  }
  if (finalAnswer !== undefined) {
    extracted.finalAnswer = finalAnswer;
  }

  // Attempt to extract an actions array if present
  const actionsKeyIndex = raw.search(/"actions"\s*\:/i);
  if (actionsKeyIndex !== -1) {
    const bracketStart = raw.indexOf("[", actionsKeyIndex);
    if (bracketStart !== -1) {
      const arrayText = extractJsonArrayFromIndex(raw, bracketStart);
      if (arrayText !== null) {
        try {
          const parsedArray = JSON.parse(arrayText);
          if (Array.isArray(parsedArray) && parsedArray.length > 0) {
            extracted.actions = parsedArray as any;
          }
        } catch {
          // ignore parse errors here; fall back to other extraction
        }
      }
    }
  }

  if (Object.keys(extracted).length > 0) {
    return extracted as ReActResponse;
  }

  return null;
};

const normalizeReActString = (value: any): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      trimmed === "" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "undefined"
    ) {
      return null;
    }
    return trimmed;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
};

const validateReActResponse = (
  extracted: any,
): {
  thought: string | null;
  action: string | null;
  actionInput: Record<string, any> | null;
  finalAnswer: string | null;
  parallelActions?: Array<{ action: string; actionInput: any }>;
  warnings?: string[];
} => {
  const thought = normalizeReActString(extracted.thought);
  let action = normalizeReActString(extracted.action);
  const finalAnswer = normalizeReActString(extracted.finalAnswer);
  const rawActionInput =
    extracted.actionInput !== undefined
      ? extracted.actionInput
      : extracted.params !== undefined
        ? extracted.params
        : null;

  if (action === "") {
    action = null;
  }

  let actionInput: Record<string, any> | null = null;
  if (rawActionInput !== null && rawActionInput !== undefined) {
    if (typeof rawActionInput === "string") {
      const parsed = parseJsonSafe(rawActionInput);
      if (isObject(parsed)) {
        actionInput = parsed;
      }
    } else if (isObject(rawActionInput)) {
      actionInput = rawActionInput as Record<string, any>;
    }
  }

  const warnings: string[] = [];

  // Detect actions array in the extracted value (if present)
  let parallelActions: Array<{ action: string; actionInput: any }> | undefined;
  if (extracted.actions !== undefined) {
    if (Array.isArray(extracted.actions) && extracted.actions.length > 0) {
      const parsedActions: Array<{ action: string; actionInput: any }> = [];
      let malformed = false;
      for (const entry of extracted.actions) {
        if (!isObject(entry)) {
          malformed = true;
          break;
        }
        const rawAct = normalizeReActString((entry as any).action);
        let rawInput = (entry as any).actionInput;
        if (
          rawInput !== null &&
          rawInput !== undefined &&
          typeof rawInput === "string"
        ) {
          const parsed = parseJsonSafe(rawInput);
          if (isObject(parsed)) rawInput = parsed;
        }
        if (!rawAct) {
          malformed = true;
          break;
        }
        parsedActions.push({ action: rawAct, actionInput: rawInput ?? null });
      }
      if (!malformed) {
        parallelActions = parsedActions;
      } else {
        // fallback: if malformed, try to use first element as single action
        if (Array.isArray(extracted.actions) && extracted.actions.length > 0) {
          const first = extracted.actions[0];
          const firstAct = normalizeReActString((first as any).action);
          let firstInput = (first as any).actionInput;
          if (
            firstInput !== null &&
            firstInput !== undefined &&
            typeof firstInput === "string"
          ) {
            const parsed = parseJsonSafe(firstInput);
            if (isObject(parsed)) firstInput = parsed;
          }
          if (firstAct) {
            action = firstAct;
            actionInput = isObject(firstInput) ? firstInput : null;
            warnings.push("actions-array-malformed-fell-back-to-first");
          }
        }
      }
    } else {
      warnings.push("actions-array-present-but-empty-or-not-array");
    }
  }

  // If neither action nor parallelActions provided and no final answer, warn about idle step
  if (
    !action &&
    (!parallelActions || parallelActions.length === 0) &&
    !finalAnswer
  ) {
    warnings.push("no-action");
  }

  return {
    thought,
    action,
    actionInput,
    finalAnswer,
    parallelActions,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

const buildAllowedToolSet = (
  rawAllowedTools: any,
  registry: any,
): { allowed: ReadonlyMap<string, any>; unknownTools: string[] } => {
  const allowed = new Map<string, any>();
  const unknownTools: string[] = [];
  const toolCandidates: string[] = Array.isArray(rawAllowedTools)
    ? rawAllowedTools.map((tool) => String(tool).trim())
    : typeof rawAllowedTools === "string"
      ? rawAllowedTools.split(/[,;\n]+/).map((tool) => String(tool).trim())
      : [];

  for (const rawTool of toolCandidates) {
    if (!rawTool) {
      continue;
    }
    const normalized = rawTool.toLowerCase();
    if (!registry || typeof registry.get !== "function") {
      unknownTools.push(normalized);
      continue;
    }
    const toolDef = registry.get(normalized);
    if (toolDef) {
      allowed.set(normalized, toolDef);
    } else {
      unknownTools.push(normalized);
    }
  }

  return {
    allowed: Object.freeze(allowed) as ReadonlyMap<string, any>,
    unknownTools,
  };
};

const validateToolCall = (
  action: any,
  allowed: ReadonlyMap<string, any>,
  context: any,
): {
  permitted: boolean;
  normalizedAction: string;
  reason: string;
} => {
  const normalizedAction =
    typeof action === "string"
      ? action.trim().toLowerCase()
      : String(action ?? "")
          .trim()
          .toLowerCase();

  if (!normalizedAction) {
    return {
      permitted: false,
      normalizedAction,
      reason: "action was empty or null",
    };
  }

  if (/[^a-z0-9_-]/.test(normalizedAction)) {
    return {
      permitted: false,
      normalizedAction,
      reason: `action contains invalid characters: ${String(action)}`,
    };
  }

  if (normalizedAction === "react-agent") {
    return {
      permitted: false,
      normalizedAction,
      reason: "agent cannot call itself",
    };
  }

  if (!allowed.has(normalizedAction)) {
    const allowedNames = Array.from(allowed.keys()).join(", ") || "none";
    return {
      permitted: false,
      normalizedAction,
      reason: `tool ${normalizedAction} is not in the allowed tools list for this agent. Allowed tools: ${allowedNames}`,
    };
  }

  const toolDef = allowed.get(normalizedAction);
  if (!toolDef || typeof toolDef.handler !== "function") {
    return {
      permitted: false,
      normalizedAction,
      reason: `tool ${normalizedAction} exists in allow-list but has no executable handler`,
    };
  }

  return {
    permitted: true,
    normalizedAction,
    reason: "authorized",
  };
};

const createLoopGuard = (
  config: {
    maxConsecutiveParseFailures?: number;
    maxConsecutiveToolFailures?: number;
    maxRepeatedActions?: number;
    maxTotalFailures?: number;
  } = {},
) => {
  const maxConsecutiveParseFailures = Number.isFinite(
    Number(config.maxConsecutiveParseFailures ?? 3),
  )
    ? Number(config.maxConsecutiveParseFailures)
    : 3;
  const maxConsecutiveToolFailures = Number.isFinite(
    Number(config.maxConsecutiveToolFailures ?? 3),
  )
    ? Number(config.maxConsecutiveToolFailures)
    : 3;
  const maxRepeatedActions = Number.isFinite(
    Number(config.maxRepeatedActions ?? 3),
  )
    ? Number(config.maxRepeatedActions)
    : 3;
  const maxTotalFailures = Number.isFinite(Number(config.maxTotalFailures ?? 5))
    ? Number(config.maxTotalFailures)
    : 5;

  let consecutiveParseFailures = 0;
  let consecutiveToolFailures = 0;
  let totalFailures = 0;
  const perToolFailures: Record<string, number> = {};
  let deniedActionCount = 0;
  const recentActions: Array<{ action: string; parallel: boolean }> = [];

  const recordAction = (action: string, fromParallel = false) => {
    if (!action) return;
    recentActions.push({ action, parallel: Boolean(fromParallel) });
    if (recentActions.length > 10) recentActions.shift();
  };

  const getLastActions = () => recentActions.map((r) => r.action);

  return {
    recordParseFailure: () => {
      consecutiveParseFailures += 1;
      totalFailures += 1;
    },
    recordParseSuccess: () => {
      consecutiveParseFailures = 0;
    },
    recordToolFailure: (toolType: string) => {
      consecutiveToolFailures += 1;
      totalFailures += 1;
      const key = String(toolType ?? "unknown")
        .trim()
        .toLowerCase();
      perToolFailures[key] = (perToolFailures[key] || 0) + 1;
    },
    recordToolSuccess: (_toolType: string) => {
      consecutiveToolFailures = 0;
    },
    recordAction: (action: string, fromParallel = false) => {
      recordAction(String(action ?? "").trim(), fromParallel);
    },
    recordDeniedAction: (_action: string) => {
      deniedActionCount += 1;
    },
    shouldStop: () => {
      if (consecutiveParseFailures >= maxConsecutiveParseFailures) {
        return {
          stop: true,
          reason: `The model returned non-parseable responses ${maxConsecutiveParseFailures} times in a row and cannot recover.`,
        };
      }

      if (consecutiveToolFailures >= maxConsecutiveToolFailures) {
        return {
          stop: true,
          reason: `The same tool failed ${maxConsecutiveToolFailures} times consecutively and the agent cannot proceed.`,
        };
      }

      const actionCounts = recentActions.reduce<Record<string, number>>(
        (acc, item) => {
          const key = item.action;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {},
      );
      for (const count of Object.values(actionCounts)) {
        if (count >= 5) {
          return {
            stop: true,
            reason:
              "The agent is stuck in a repetitive loop calling the same action repeatedly without progress.",
          };
        }
      }

      if (recentActions.length >= 6) {
        const window = recentActions.slice(-6);
        const pairToString = (index: number) =>
          `${window[index]?.action ?? ""}|${window[index + 1]?.action ?? ""}`;
        const first = pairToString(0);
        const second = pairToString(2);
        const third = pairToString(4);
        if (first && first === second && second === third) {
          return {
            stop: true,
            reason:
              "The agent is cycling through the same two-step sequence repeatedly without making progress.",
          };
        }
      }

      if (recentActions.length >= 3) {
        const lastFour = recentActions.slice(-4);
        const countsByAction: Record<
          string,
          { total: number; parallelCount: number }
        > = {};
        for (const entry of lastFour) {
          const key = entry.action;
          if (!countsByAction[key]) {
            countsByAction[key] = { total: 0, parallelCount: 0 };
          }
          countsByAction[key].total += 1;
          if (entry.parallel) {
            countsByAction[key].parallelCount += 1;
          }
        }
        for (const counts of Object.values(countsByAction)) {
          if (counts.parallelCount >= 3) {
            return {
              stop: true,
              reason:
                "The agent is repeatedly including the same tool in parallel batches without using its results.",
            };
          }
        }
      }

      if (totalFailures >= maxTotalFailures) {
        return {
          stop: true,
          reason:
            "The agent has exceeded its total failure budget across parse errors and tool failures.",
        };
      }

      if (deniedActionCount >= 3) {
        return {
          stop: true,
          reason:
            "The agent repeatedly attempted unauthorized tool calls and cannot operate within its permissions.",
        };
      }

      return { stop: false, reason: "" };
    },
    getSummary: () => ({
      consecutiveParseFailures,
      consecutiveToolFailures,
      totalFailures,
      deniedActionCount,
      perToolFailures: { ...perToolFailures },
      recentActions: getLastActions(),
    }),
  };
};

type ToolFieldDescriptor = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description?: string;
};

type ToolSchema = {
  fields: ToolFieldDescriptor[];
};

const normalizeFieldType = (value: any): ToolFieldDescriptor["type"] => {
  const asString = String(value ?? "").toLowerCase();
  if (asString.includes("string")) return "string";
  if (
    asString.includes("number") ||
    asString.includes("int") ||
    asString.includes("float") ||
    asString.includes("double")
  )
    return "number";
  if (asString.includes("bool")) return "boolean";
  if (asString.includes("array")) return "array";
  if (
    asString.includes("object") ||
    asString.includes("record") ||
    asString.includes("map")
  )
    return "object";
  return "string";
};

const inferToolSchema = (toolDefinition: any): ToolSchema => {
  if (!isObject(toolDefinition)) {
    return { fields: [] };
  }

  const extractDescriptors = (source: any): ToolFieldDescriptor[] => {
    if (!isObject(source)) {
      return [];
    }

    if (Array.isArray(source.fields)) {
      return source.fields
        .map((field: any) => {
          if (!field || !field.name) return null;
          return {
            name: String(field.name),
            type: normalizeFieldType(field.type || field.dataType || "string"),
            required: Boolean(field.required),
            description:
              typeof field.description === "string"
                ? field.description
                : undefined,
          } as ToolFieldDescriptor;
        })
        .filter(Boolean) as ToolFieldDescriptor[];
    }

    if (isObject(source.properties)) {
      const requiredNames = Array.isArray(source.required)
        ? source.required.map((name: any) => String(name))
        : [];
      return Object.entries(source.properties).map(([name, property]: any) => ({
        name,
        type: normalizeFieldType(
          property?.type || property?.schema?.type || property?.dataType,
        ),
        required: requiredNames.includes(name),
        description:
          typeof property?.description === "string"
            ? property.description
            : undefined,
      }));
    }

    return [];
  };

  const validationSource = (toolDefinition.validation as any) || {};
  const candidates = [
    toolDefinition.schema,
    toolDefinition.validation,
    validationSource.input,
    toolDefinition.inputSchema,
    toolDefinition.fields,
  ];

  for (const candidate of candidates) {
    const fields = extractDescriptors(candidate);
    if (fields.length > 0) {
      return { fields };
    }
  }

  return { fields: [] };
};

const validateToolInput = (
  actionInput: any,
  schema: ToolSchema,
  toolType: string,
): {
  valid: boolean;
  sanitized: Record<string, any>;
  errors: string[];
  warnings: string[];
} => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const requiredFields = fields
    .filter((field) => field.required)
    .map((field) => field.name);

  const typeOfValue = (value: any): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  };

  const coerceValue = (
    value: any,
    expectedType: ToolFieldDescriptor["type"],
    fieldName: string,
  ): any => {
    if (value === null || value === undefined) {
      return value;
    }

    if (expectedType === "string") {
      if (typeof value === "number" || typeof value === "boolean") {
        warnings.push(
          `${fieldName} was coerced from ${typeof value} to string`,
        );
        return String(value);
      }
      if (typeof value === "string") {
        return value;
      }
      return value;
    }

    if (expectedType === "number") {
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
          warnings.push(`${fieldName} was coerced from string to number`);
          return Number(trimmed);
        }
      }
      return value;
    }

    if (expectedType === "boolean") {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        if (lower === "true") {
          warnings.push(`${fieldName} was coerced from string to boolean`);
          return true;
        }
        if (lower === "false") {
          warnings.push(`${fieldName} was coerced from string to boolean`);
          return false;
        }
      }
      return value;
    }

    if (expectedType === "object") {
      return value;
    }

    if (expectedType === "array") {
      return value;
    }

    return value;
  };

  const isPlainObject = (value: any): value is Record<string, any> =>
    isObject(value) && !Array.isArray(value);

  if (actionInput === null || actionInput === undefined) {
    if (requiredFields.length === 0) {
      warnings.push(`actionInput was null and defaulted to empty object`);
      return {
        valid: true,
        sanitized: {},
        errors: [],
        warnings,
      };
    }

    return {
      valid: false,
      sanitized: {},
      errors: [
        `actionInput is required for ${toolType} and missing required fields: ${requiredFields.join(", ")}`,
      ],
      warnings,
    };
  }

  let normalizedInput: any = actionInput;

  if (typeof actionInput === "string") {
    const trimmed = actionInput.trim();
    try {
      const parsed = JSON.parse(trimmed);
      normalizedInput = parsed;
      warnings.push(
        `actionInput was a JSON string and was parsed automatically`,
      );
    } catch {
      const requiredStringFields = fields.filter(
        (field) => field.required && field.type === "string",
      );
      if (requiredStringFields.length === 1) {
        normalizedInput = {
          [requiredStringFields[0].name]: actionInput,
        };
        warnings.push(
          `actionInput was a raw string and was mapped to field ${requiredStringFields[0].name}`,
        );
      } else {
        return {
          valid: false,
          sanitized: {},
          errors: [
            `actionInput must be an object but received a string for ${toolType}`,
          ],
          warnings,
        };
      }
    }
  }

  if (Array.isArray(normalizedInput)) {
    const arrayFields = fields.filter((field) => field.type === "array");
    if (arrayFields.length === 1) {
      normalizedInput = {
        [arrayFields[0].name]: actionInput,
      };
    } else {
      return {
        valid: false,
        sanitized: {},
        errors: [
          `actionInput must be an object but received an array for ${toolType}`,
        ],
        warnings,
      };
    }
  }

  if (!isPlainObject(normalizedInput)) {
    return {
      valid: false,
      sanitized: {},
      errors: [
        `actionInput must be an object for ${toolType} but received ${typeOfValue(normalizedInput)}`,
      ],
      warnings,
    };
  }

  const sanitizedKnown: Record<string, any> = {};
  const inputKeys = Object.keys(normalizedInput);

  for (const field of fields) {
    const rawValue = normalizedInput[field.name];
    const hasKey = Object.prototype.hasOwnProperty.call(
      normalizedInput,
      field.name,
    );

    if (!hasKey) {
      if (field.required) {
        errors.push(
          `${field.name} is required but was not provided for ${toolType}`,
        );
      }
      continue;
    }

    if (typeof rawValue === "function") {
      errors.push(
        `${field.name} contained a function value which was removed for security`,
      );
      continue;
    }

    let coercedValue = rawValue;
    if (field.type === "string") {
      if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        coercedValue = coerceValue(rawValue, field.type, field.name);
      } else if (typeof rawValue !== "string") {
        errors.push(
          `${field.name} expected string but received ${typeOfValue(rawValue)}`,
        );
        continue;
      }
    } else if (field.type === "number") {
      if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
          coercedValue = coerceValue(rawValue, field.type, field.name);
        } else {
          errors.push(`${field.name} expected number but received string`);
          continue;
        }
      } else if (typeof rawValue !== "number") {
        errors.push(
          `${field.name} expected number but received ${typeOfValue(rawValue)}`,
        );
        continue;
      }
    } else if (field.type === "boolean") {
      if (typeof rawValue === "string") {
        const lower = rawValue.trim().toLowerCase();
        if (lower === "true" || lower === "false") {
          coercedValue = coerceValue(rawValue, field.type, field.name);
        } else {
          errors.push(`${field.name} expected boolean but received string`);
          continue;
        }
      } else if (typeof rawValue !== "boolean") {
        errors.push(
          `${field.name} expected boolean but received ${typeOfValue(rawValue)}`,
        );
        continue;
      }
    } else if (field.type === "object") {
      if (!isPlainObject(rawValue)) {
        errors.push(
          `${field.name} expected object but received ${typeOfValue(rawValue)}`,
        );
        continue;
      }
    } else if (field.type === "array") {
      if (!Array.isArray(rawValue)) {
        errors.push(
          `${field.name} expected array but received ${typeOfValue(rawValue)}`,
        );
        continue;
      }
    }

    sanitizedKnown[field.name] = coercedValue;
  }

  const sanitizedOutput: Record<string, any> = { ...sanitizedKnown };
  const schemaFieldNames = new Set(fields.map((field) => field.name));

  if (errors.length === 0) {
    for (const key of inputKeys) {
      if (schemaFieldNames.has(key)) {
        continue;
      }
      const value = normalizedInput[key];
      if (typeof value === "function") {
        errors.push(
          `${key} contained a function value which was removed for security`,
        );
        continue;
      }
      sanitizedOutput[key] = value;
      warnings.push(
        `${key} is not in the schema and was passed through unvalidated`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      sanitized: sanitizedKnown,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    sanitized: sanitizedOutput,
    errors,
    warnings,
  };
};

const MAX_TOOL_OUTPUT_CHARS = 1500;

const normalizeToolOutput = (rawToolResult: any): string => {
  try {
    if (rawToolResult === null) {
      return "[no output]";
    }
    if (rawToolResult === undefined) {
      return "[undefined output]";
    }

    if (typeof rawToolResult === "boolean") {
      return String(rawToolResult);
    }

    if (typeof rawToolResult === "number") {
      if (Number.isNaN(rawToolResult) || !Number.isFinite(rawToolResult)) {
        return "[invalid number]";
      }
      return String(rawToolResult);
    }

    if (typeof rawToolResult === "string") {
      const truncated = rawToolResult;
      if (truncated.length <= MAX_TOOL_OUTPUT_CHARS) {
        return truncated;
      }
      const total = truncated.length;
      return `${truncated.slice(0, 1000)}... [truncated, ${total} chars total] ...${truncated.slice(-300)}`;
    }

    let outputValue: any = rawToolResult;
    if (isObject(rawToolResult) && "output" in rawToolResult) {
      const result = rawToolResult.output;
      if (rawToolResult.success === false && rawToolResult.error) {
        const errorMsg =
          typeof rawToolResult.error === "string"
            ? rawToolResult.error
            : JSON.stringify(rawToolResult.error);
        outputValue = `[Tool failed: ${errorMsg}]`;
      } else {
        outputValue = result;
      }
      if (Array.isArray(rawToolResult.logs)) {
        const logs = rawToolResult.logs;
        const lastLogs = logs
          .slice(-2)
          .filter((entry) => typeof entry === "string");
        if (lastLogs.length > 0) {
          const suffix = ` Logs: ${lastLogs.join(" | ")}`;
          if (typeof outputValue === "string") {
            outputValue += suffix;
          } else {
            try {
              outputValue = `${JSON.stringify(outputValue)}${suffix}`;
            } catch {
              outputValue = `[Tool output with logs: ${suffix}]`;
            }
          }
        }
      }
    }

    if (typeof outputValue === "string") {
      const truncated = outputValue;
      if (truncated.length <= MAX_TOOL_OUTPUT_CHARS) {
        return truncated;
      }
      const total = truncated.length;
      return `${truncated.slice(0, 1000)}... [truncated, ${total} chars total] ...${truncated.slice(-300)}`;
    }

    if (isObject(outputValue) && typeof outputValue.text === "string") {
      return normalizeToolOutput(outputValue.text);
    }
    if (isObject(outputValue) && typeof outputValue.message === "string") {
      return normalizeToolOutput(outputValue.message);
    }
    if (isObject(outputValue) && typeof outputValue.content === "string") {
      return normalizeToolOutput(outputValue.content);
    }
    if (isObject(outputValue) && "result" in outputValue) {
      return normalizeToolOutput(outputValue.result);
    }

    const seen = new WeakSet();
    const replacer = (_key: string, value: any): any => {
      if (typeof value === "function") {
        return "[function]";
      }
      if (
        (typeof Buffer !== "undefined" && value instanceof Buffer) ||
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer
      ) {
        return "[binary data]";
      }
      if (isObject(value) || Array.isArray(value)) {
        if (seen.has(value)) {
          return "[circular reference]";
        }
        seen.add(value);
        const ctorName = value.constructor?.name;
        if (
          ctorName &&
          ctorName !== "Object" &&
          ctorName !== "Array" &&
          ctorName !== null
        ) {
          return `[${ctorName} object]`;
        }
      }
      return value;
    };

    try {
      const serialized = JSON.stringify(outputValue, replacer);
      if (typeof serialized === "string") {
        if (serialized.length <= MAX_TOOL_OUTPUT_CHARS) {
          return serialized;
        }
        const total = serialized.length;
        return `${serialized.slice(0, 1000)}... [truncated, ${total} chars total] ...${serialized.slice(-300)}`;
      }
    } catch {
      return "[non-serializable output]";
    }

    return "[non-serializable output]";
  } catch {
    return "[non-serializable output]";
  }
};

const summarizeToolOutput = (
  normalizedOutput: string,
  toolType: string,
  iteration: number,
  taskDescription?: string,
): string => {
  try {
    const toolLabel = String(toolType || "unknown").trim() || "unknown";
    const text = String(normalizedOutput ?? "").trim();
    if (!text) {
      return `[Summary of ${toolLabel} output, iteration ${iteration}] [no tool output]`;
    }

    if (text.length < 300) {
      return text;
    }

    const maybeSentenceSplit = (input: string): string[] => {
      const sentences = input
        .replace(/\s+/g, " ")
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g);
      return sentences ? sentences.map((s) => s.trim()) : [input.trim()];
    };

    const firstSentence = (input: string): string => {
      return maybeSentenceSplit(input)[0] || input;
    };

    const lastSentence = (input: string): string => {
      const sentences = maybeSentenceSplit(input);
      return sentences[sentences.length - 1] || input;
    };

    const compressWebSearch = (input: string): string | null => {
      const blocks = input.split(/\n\s*\n+/g).slice(0, 6);
      const results: string[] = [];
      for (const block of blocks) {
        if (results.length >= 3) {
          break;
        }
        const titleMatch = /title\s*[:\-]\s*(.+)/i.exec(block);
        const urlMatch = /url\s*[:\-]\s*(https?:\/\/\S+)/i.exec(block);
        const snippetMatch = /snippet\s*[:\-]\s*([\s\S]+)/i.exec(block);
        const title = titleMatch?.[1]?.trim();
        const url = urlMatch?.[1]?.trim();
        let snippet = snippetMatch?.[1]?.trim() ?? "";
        if (!snippet) {
          const sentence = firstSentence(block.replace(/\r?\n/g, " "));
          snippet = sentence;
        }
        if (title || url || snippet) {
          const snippetSentence = firstSentence(snippet);
          results.push(
            `${title ? `Title: ${title}` : ""}${title && url ? "; " : ""}${url ? `URL: ${url}` : ""}${snippetSentence ? `; Snippet: ${snippetSentence}` : ""}`.replace(
              /; $/,
              "",
            ),
          );
        }
      }
      return results.length > 0
        ? `[Summary of web-search output, iteration ${iteration}] ${results.join(" \n")}`
        : null;
    };

    const compressHttpRequest = (input: string): string | null => {
      const statusMatch =
        /(?:status|statusCode|status_code)\s*[:=]\s*(\d{3})/i.exec(input);
      const jsonBody = parseJsonSafe(input);
      const parts: string[] = [];
      if (statusMatch) {
        parts.push(`status: ${statusMatch[1]}`);
      }
      if (isObject(jsonBody)) {
        const topKeys = Object.keys(jsonBody).slice(0, 8);
        if (topKeys.length > 0) {
          parts.push(
            `top-level keys: ${topKeys
              .map((key) => {
                const value = jsonBody[key];
                if (Array.isArray(value)) {
                  return `${key}(array)`;
                }
                if (value === null) {
                  return `${key}(null)`;
                }
                return `${key}(${typeof value})`;
              })
              .join(", ")}`,
          );
          parts.push("[full response truncated]");
        }
      }
      return parts.length > 0
        ? `[Summary of core-http-request output, iteration ${iteration}] ${parts.join("; ")}`
        : null;
    };

    const compressLLM = (input: string): string => {
      const firstPara = input.split(/\n\s*\n/)[0] || input;
      const lastSent = lastSentence(input);
      return `[Summary of ${toolLabel} output, iteration ${iteration}] ${firstPara.trim()} ${lastSent.trim()}`.trim();
    };

    const cleanSentence = (sentence: string): string =>
      sentence.replace(/\s+/g, " ").trim();
    const isSignalWord = (value: string): boolean => {
      const signalWords = [
        "result",
        "found",
        "error",
        "failed",
        "success",
        "total",
        "count",
        "created",
        "updated",
        "deleted",
      ];
      return signalWords.some((word) =>
        new RegExp(`\\b${word}\\b`, "i").test(value),
      );
    };
    const scoreSentence = (sentence: string): number => {
      let score = 0;
      if (/[0-9]/.test(sentence)) {
        score += 2;
      }
      const words = sentence.split(/\s+/);
      for (const word of words) {
        if (/^[A-Z][a-z]+/.test(word) && !/^I$/.test(word)) {
          score += 1;
        }
      }
      if (isSignalWord(sentence)) {
        score += 2;
      }
      if (taskDescription) {
        const taskWords = String(taskDescription)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        for (const token of taskWords) {
          if (
            token.length > 3 &&
            new RegExp(`\\b${token}\\b`, "i").test(sentence)
          ) {
            score += 1;
          }
        }
      }
      return score;
    };

    const compressGeneral = (input: string): string => {
      const sentences = maybeSentenceSplit(input);
      const scored = sentences.map((sentence, index) => ({
        sentence: cleanSentence(sentence),
        score: scoreSentence(sentence),
        index,
      }));
      const topSentences = [...scored]
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 3)
        .map((entry) => entry.sentence);

      const selected = new Set<string>();
      const ordered: string[] = [];
      const add = (value: string | undefined) => {
        if (!value) {
          return;
        }
        const normalized = value.trim();
        if (!normalized || selected.has(normalized)) {
          return;
        }
        selected.add(normalized);
        ordered.push(normalized);
      };

      add(sentences[0]);
      topSentences.forEach(add);
      if (sentences.length > 1) {
        add(sentences[sentences.length - 1]);
      }

      const body = ordered.join(" ");
      return `[Summary of ${toolLabel} output, iteration ${iteration}] ${body}`;
    };

    let compressed: string | null = null;
    const normalizedType = toolLabel.toLowerCase();
    if (normalizedType === "web-search") {
      compressed = compressWebSearch(text);
    } else if (normalizedType === "core-http-request") {
      compressed = compressHttpRequest(text);
    } else if (normalizedType === "ai" || normalizedType.includes("llm")) {
      compressed = compressLLM(text);
    }

    if (!compressed) {
      compressed = compressGeneral(text);
    }

    const finalText =
      compressed.trim() ||
      `[Summary of ${toolLabel} output, iteration ${iteration}] [no content]`;
    if (finalText.length <= 800) {
      return finalText;
    }

    const start = finalText.slice(0, 500);
    const end = finalText.slice(-200);
    const omitted = finalText.length - start.length - end.length;
    return `${start} [${omitted} chars omitted] ${end}`;
  } catch {
    return `[Summary of ${String(toolType || "unknown")} output, iteration ${iteration}] [compression failed]`;
  }
};

const buildContextEntry = (
  toolType: string,
  iteration: number,
  thought: string,
  action: string,
  summarizedOutput: string,
  maxIterations?: number,
  parallelCount?: number,
): string => {
  const safeThought = String(thought ?? "").trim();
  const safeAction = String(action ?? "").trim();
  const safeOutput =
    String(summarizedOutput ?? "").trim() || "[no summary available]";
  const iterLabelBase = `[Iter ${iteration}/${Number(maxIterations ?? 0)}]`;
  const parallelLabel =
    parallelCount && parallelCount > 1
      ? ` [${parallelCount} tools in parallel]`
      : "";
  const iterLabel = `${iterLabelBase}${parallelLabel}`;
  return `${iterLabel} Thought: ${safeThought} | Action: ${safeAction} | Result: ${safeOutput}`;
};

const buildSystemPrompt = (
  userSystemPrompt: string,
  toolDescriptions: Array<{ type: string; description?: string }>,
  taskInput: string,
  maxIterations: number,
  strictMode = true,
): string => {
  const sections: string[] = [];

  // Section one — role and identity
  const roleIdentity =
    "The agent is an autonomous precise reasoning system that operates in a strict reason-act-observe loop and terminates only when it has a verified final answer or exhausts its iteration budget.";
  sections.push(roleIdentity);

  // Section two — absolute output rules
  const outputRules =
    "OUTPUT FORMAT -- MANDATORY:\nEvery single response MUST be a valid JSON object and nothing else. The response must never include markdown code fences, any text outside the JSON object, natural language explanations, apologies, or confirmations. The JSON object must contain exactly these four keys and no others: thought (string containing the reasoning for this step), action (either a string matching one of the available tool names exactly or the JSON null literal), actionInput (either a JSON object containing parameters for the chosen tool or the JSON null literal), finalAnswer (either a string containing the complete response to the original task or the JSON null literal). The thought field must never be null or empty.\n\nRULES TABLE (scenario | action field | finalAnswer field):\n1) still gathering information | action: tool name | finalAnswer: null\n2) ready to answer | action: null | finalAnswer: complete string\n3) no tool needed this step but not ready to answer | action: null | finalAnswer: null (thought must explain why)\n4) INVALID, never do this | action: tool name | finalAnswer: non-null string (this will be rejected).";
  sections.push(outputRules);

  // Section three — tool usage rules
  const sortedTools = (Array.isArray(toolDescriptions) ? toolDescriptions : [])
    .slice()
    .sort((a, b) => String(a.type).localeCompare(String(b.type)));
  const numberedToolLines =
    sortedTools.length > 0
      ? sortedTools
          .map(
            (t, i) =>
              `${i + 1}. ${String(t.type)} — ${String(t.description || "").trim()}`,
          )
          .join("\n")
      : "no tools are available and the agent must reason toward a final answer using only its existing knowledge.";

  const toolRules =
    "TOOL USAGE RULES:\nList of available tools (numbered):\n" +
    numberedToolLines +
    "\nThe action field must contain the tool type string exactly as listed — no variations, abbreviations, or invented names. If the desired tool is not listed, do not attempt to call it; instead reason toward a final answer. The actionInput must match what the tool expects; when uncertain, provide the most minimal valid input rather than guessing complex structures. Do not call the same tool with identical input twice in a row.";
  sections.push(toolRules);

  // Section: PARALLEL EXECUTION (separate)
  const parallelExecution =
    "PARALLEL EXECUTION:\nDecision rule: Use the 'actions' array format if and only if you need results from two or more tools where neither result depends on the other. In all other cases use the single action format.\nCorrect example: fetching current weather for a location AND fetching latest news headlines for that location simultaneously (these are independent).\nWrong example: searching for a company name and then looking up that company's CEO (the second depends on the first).";
  sections.push(parallelExecution);

  // Section four — reasoning rules
  const reasoningRules =
    "REASONING RULES:\nThe thought field must explain what the agent knows so far, what gap exists in its knowledge, and why it is taking the chosen action or producing the final answer. Thoughts must be specific to the current iteration. The agent must make measurable progress toward a final answer on every iteration. The agent has a maximum of " +
    String(maxIterations) +
    " iterations and should plan accordingly; if few iterations remain, begin consolidating toward a final answer rather than collecting more data.";
  sections.push(reasoningRules);

  // Section five — final answer rules
  const finalAnswerRules =
    "FINAL ANSWER RULES:\nSet finalAnswer to a non-null string only when you have sufficient information to fully answer the original task. A final answer must be complete and standalone; do not prepend contextual phrases like 'based on my research'. If you reach the last iteration, produce the best possible final answer using available information rather than returning null.";
  sections.push(finalAnswerRules);
  // Section six — failure handling (structured templates)
  const failureHandling =
    'FAILURE HANDLING:\nWhen a tool fails, the thought field in the next iteration MUST follow this exact pattern: "Tool X failed with error Y. I have already tried Z. My next step is W because..." where W is either a different tool or a decision to produce a partial final answer.\n\nPartial final answer TEMPLATE (MANDATORY when giving a partial answer):\n"I was able to determine: [what was found]. I was unable to determine: [what failed and why]. Based on available information: [best answer given constraints]."\nUsing this template is mandatory when producing a partial answer.';
  sections.push(failureHandling);

  // Section seven — user context split
  const operatorBlock = userSystemPrompt
    ? String(userSystemPrompt).trim()
    : "none";
  const taskBlock = taskInput
    ? String(taskInput).trim()
    : "waiting for task input";
  const contextBlocks = `OPERATOR CONSTRAINTS:\n${operatorBlock}\n\nThe operator constraints take precedence over the task if they conflict.\n\nYOUR TASK:\n${taskBlock}`;
  sections.push(contextBlocks);

  // Section eight — iteration budget status (template since prompt built once)
  const iterationBudget = `ITERATION BUDGET STATUS:\ncurrent iteration: will be shown in each context entry\nmaximum iterations: ${Number(maxIterations)}\nIf three or fewer iterations remain you must begin consolidating toward a final answer immediately.`;
  sections.push(iterationBudget);

  let prompt = sections.join("\n\n");

  if (strictMode) {
    prompt +=
      "\n\nAny response that is not a valid JSON object will be rejected by the parser and the agent will be asked to retry, consuming an iteration. Never sacrifice JSON validity for a longer or more detailed response.";
  }

  return prompt;
};

/**
 * Execute multiple tool calls in parallel with full validation and fault tolerance.
 */
const executeParallelTools = async (
  actions: Array<{ action: any; actionInput: any }>,
  allowed: ReadonlyMap<string, any>,
  context: any,
  validateToolCallFn: (
    action: any,
    allowed: ReadonlyMap<string, any>,
    context: any,
  ) => any,
  validateToolInputFn: (input: any, schema: any, toolType: string) => any,
  normalizeToolOutputFn: (res: any) => string,
  summarizeToolOutputFn: (
    text: string,
    toolType: string,
    iteration: number,
    taskDescription?: string,
  ) => string,
  loopGuardObj: any,
): Promise<
  Array<{
    toolType: string;
    sanitizedInput: Record<string, any>;
    summarizedOutput: string;
    success: boolean;
    error?: string;
  }>
> => {
  const results: Array<any> = [];

  // Step one: validate all tool calls
  for (const entry of actions) {
    const rawAction = entry.action;
    const callValidation = validateToolCallFn(rawAction, allowed, context);
    const normalized =
      callValidation.normalizedAction ||
      String(rawAction ?? "")
        .trim()
        .toLowerCase();
    if (!callValidation.permitted) {
      results.push({
        toolType: normalized,
        sanitizedInput: {},
        summarizedOutput: "",
        success: false,
        error: callValidation.reason,
      });
      continue;
    }

    const nodeDef = allowed.get(normalized);
    const toolSchema = inferToolSchema(nodeDef);
    const inputValidation = validateToolInputFn(
      entry.actionInput,
      toolSchema,
      normalized,
    );
    if (!inputValidation.valid) {
      results.push({
        toolType: normalized,
        sanitizedInput: inputValidation.sanitized || {},
        summarizedOutput: "",
        success: false,
        error: inputValidation.errors.join("; ") || "invalid input",
      });
      continue;
    }

    results.push({
      toolType: normalized,
      sanitizedInput: inputValidation.sanitized || {},
      valid: true,
      nodeDef,
    });
  }

  // Step two: deduplicate identical parallel calls
  const seen = new Map<string, number>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.valid) continue;
    const key = `${r.toolType}::${JSON.stringify(r.sanitizedInput || {})}`;
    if (seen.has(key)) {
      // mark duplicate
      results[i] = {
        toolType: r.toolType,
        sanitizedInput: r.sanitizedInput,
        summarizedOutput: "",
        success: false,
        error: "duplicate parallel call removed",
      };
      try {
        loopGuardObj.recordDeniedAction(r.toolType);
      } catch {}
    } else {
      seen.set(key, i);
    }
  }

  // Step three: execute all valid entries concurrently
  const execPromises = results.map(async (r, idx) => {
    if (!r.valid) return { idx, fulfilled: false, error: r.error };
    const nodeDef = r.nodeDef;
    const execContext = {
      nodeId: `${context.nodeId}-react-parallel-${Date.now()}-${idx}`,
      nodeType: r.toolType,
      config: r.sanitizedInput || {},
      input: r.sanitizedInput || {},
      previousOutputs: context.previousOutputs || {},
      variables: context.variables || {},
      apiKeys: context.apiKeys || {},
      edges: context.edges,
      nodes: context.nodes,
      workflowId: context.workflowId,
      executionId: context.executionId,
      registry: context.registry,
    };

    try {
      const toolResult = await (nodeDef.handler as any)(execContext);
      return { idx, fulfilled: true, result: toolResult };
    } catch (err: any) {
      return { idx, fulfilled: false, error: String(err?.message || err) };
    }
  });

  const settled = await Promise.allSettled(execPromises.map((p) => p));

  // Step four: process results
  const finalResults: Array<any> = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      const payload = s.value as any;
      if (!payload.fulfilled) {
        finalResults.push({
          toolType: results[payload.idx]?.toolType || "unknown",
          sanitizedInput: results[payload.idx]?.sanitizedInput || {},
          summarizedOutput: "",
          success: false,
          error: payload.error || "execution failed",
        });
        if (typeof loopGuardObj?.recordToolFailure === "function") {
          try {
            loopGuardObj.recordToolFailure(results[payload.idx]?.toolType);
          } catch {}
        }
        continue;
      }

      const raw = payload.result;
      const toolType = results[payload.idx]?.toolType || "unknown";
      if (typeof loopGuardObj?.recordToolSuccess === "function") {
        try {
          loopGuardObj.recordToolSuccess(toolType);
        } catch {}
      }
      const toolText = normalizeToolOutputFn(raw);
      const summarized = summarizeToolOutputFn(
        toolText,
        toolType,
        0,
        context?.input?.text || context?.config?.task,
      );
      finalResults.push({
        toolType,
        sanitizedInput: results[payload.idx]?.sanitizedInput || {},
        summarizedOutput: summarized,
        success: true,
      });
    } else {
      // promise rejected
      const payload = (s as any).reason;
      const res = results[i];
      const toolType = res?.toolType || "unknown";
      if (typeof loopGuardObj?.recordToolFailure === "function") {
        try {
          loopGuardObj.recordToolFailure(toolType);
        } catch {}
      }
      finalResults.push({
        toolType,
        sanitizedInput: res?.sanitizedInput || {},
        summarizedOutput: "",
        success: false,
        error: String(payload || "execution error"),
      });
    }
  }

  // Step five: return results array
  return finalResults;
};

const mergeParallelResults = (
  results: Array<{
    toolType: string;
    sanitizedInput: Record<string, any>;
    summarizedOutput: string;
    success: boolean;
    error?: string;
  }>,
  thought: string,
  iteration: number,
  maxIterations: number,
): string => {
  const iterLabel = `[Iter ${iteration}/${Number(maxIterations ?? 0)}]`;
  const header = `${iterLabel} Parallel results:`;
  const lines: string[] = [];
  for (const r of results) {
    const status = r.success ? "SUCCESS" : "FAIL";
    const body = r.success
      ? r.summarizedOutput || "[no output]"
      : r.error || "[error]";
    lines.push(`${r.toolType}: ${status} - ${body}`);
  }

  let bodyText = lines.join("\n");
  const footerParts: string[] = [];
  const failed = results.filter((r) => !r.success).map((r) => r.toolType);
  if (failed.length === results.length) {
    footerParts.push(
      "All parallel tool calls failed; consider a different approach.",
    );
  } else if (failed.length > 0) {
    footerParts.push(
      `Some tools failed: ${Array.from(new Set(failed)).join(", ")}.`,
    );
  }
  const footer = footerParts.join(" ");

  const combined = `${header}\n${bodyText}${footer ? "\n" + footer : ""}`;
  if (combined.length <= 800) return combined;

  // Proportional truncation
  const available = 800 - header.length - (footer ? footer.length + 1 : 0) - 2;
  const per = Math.max(40, Math.floor(available / Math.max(1, results.length)));
  const truncatedLines = lines.map((ln) =>
    ln.length > per ? ln.slice(0, per - 3) + "..." : ln,
  );
  const finalText = `${header}\n${truncatedLines.join("\n")}${footer ? "\n" + footer : ""}`;
  return finalText.slice(0, 800);
};

const estimateTokens = (text: string): number => {
  const length = Math.max(0, String(text ?? "").length);
  return Math.max(1, Math.ceil(length / 4));
};

export const reactAgentHandler = async (context: any) => {
  const config = context.config || {};
  const provider = (
    config.llmProvider ||
    config.provider ||
    config["LLM Provider"] ||
    "openai"
  )
    .toString()
    .toLowerCase();
  const apiKey = config.apiKey || context.apiKeys?.[provider];
  const systemPrompt = String(
    config.systemPrompt ||
      "You are a ReAct agent. Reason and act using available tools.",
  );
  const taskInput = String(
    config.task ||
      config.prompt ||
      context.input?.text ||
      context.input?.output?.text ||
      context.input?.message ||
      "",
  ).trim();
  const model = String(config.model || config.Model || "").trim();
  const rawMax = Number(config.maxIterations ?? config["Max Iterations"] ?? 5);
  const maxIterations = Math.min(10, Number.isFinite(rawMax) ? rawMax : 5);
  const allowedTools = Array.isArray(config.allowedTools)
    ? config.allowedTools
    : typeof config.allowedTools === "string"
      ? config.allowedTools
          .split(/[,;\n]+/)
          .map((s: string) => s.trim())
          .filter(Boolean)
      : config.allowedTools || [];

  const registry = context.registry;
  const { allowed: allowedToolMap, unknownTools } = buildAllowedToolSet(
    config.allowedTools,
    registry,
  );

  if (!apiKey) {
    return {
      success: false,
      error: "API key not provided for react-agent",
      nodeId: context.nodeId,
    };
  }

  let toolDescriptions: Array<{ type: string; description?: string }> = [];
  if (registry && typeof registry.get === "function") {
    toolDescriptions = (Array.isArray(allowedTools) ? allowedTools : [])
      .map((t: any) => {
        const type = String(t).trim().toLowerCase();
        const def = registry.get(type);
        return def?.type === "react-agent"
          ? null
          : { type, description: def?.description || "" };
      })
      .filter(Boolean) as Array<{ type: string; description?: string }>;
  } else {
    toolDescriptions = [];
  }

  // Prepare LLM
  const llm = llmFactory.createLLM({
    provider: provider as any,
    apiKey,
    model,
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 1500,
  });

  const scratchpad: string[] = [];
  let history: string[] = [
    buildSystemPrompt(
      systemPrompt,
      toolDescriptions,
      taskInput,
      maxIterations,
      true,
    ),
  ];

  if (unknownTools.length > 0) {
    history.push(
      `Configured tool types were not found in the injected registry: ${unknownTools.join(", ")}. These tools will be ignored.`,
    );
  }

  const trimHistory = () => {
    if (history.length > 6) {
      history = [history[0], ...history.slice(-4)];
    }
  };

  const parseThreshold = (value: any, fallback: number): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const loopGuard = createLoopGuard({
    maxConsecutiveParseFailures: parseThreshold(
      config.maxConsecutiveParseFailures ??
        config["maxConsecutiveParseFailures"],
      3,
    ),
    maxConsecutiveToolFailures: parseThreshold(
      config.maxConsecutiveToolFailures ?? config["maxConsecutiveToolFailures"],
      3,
    ),
    maxRepeatedActions: parseThreshold(
      config.maxRepeatedActions ?? config["maxRepeatedActions"],
      3,
    ),
    maxTotalFailures: parseThreshold(
      config.maxTotalFailures ?? config["maxTotalFailures"],
      5,
    ),
  });

  let iteration = 0;
  let lastRawResponse = "";
  let guardTriggered = false;
  let guardStopReason = "";

  while (iteration < maxIterations) {
    const guardCheck = loopGuard.shouldStop();
    if (guardCheck.stop) {
      guardTriggered = true;
      guardStopReason = guardCheck.reason;
      break;
    }

    // Prompt refresh reminder at the start of every third iteration (3,6,9)
    if ((iteration + 1) % 3 === 0) {
      const formatLine =
        "OUTPUT FORMAT: JSON object with keys: thought, action, actionInput, finalAnswer. No text outside the JSON object.";
      const toolsLine = `TOOLS: ${toolDescriptions.map((t) => String(t.type)).join(", ") || "none"}`;
      history.push(`FORMAT REMINDER:\n${formatLine}\n${toolsLine}`);
      trimHistory();
    }

    const currentHistoryText = history.join("\n\n");
    let promptHistory = history;
    if (estimateTokens(currentHistoryText) > 6000) {
      promptHistory = [history[0], ...history.slice(-2)];
      scratchpad.push(
        "[warning] Context was compressed due to token budget pressure.",
      );
    }
    const prompt = `${promptHistory.join("\n\n")}\n\nRespond with a JSON object only with keys: thought, action, actionInput, finalAnswer. If no final answer yet set finalAnswer to null.`;

    try {
      const maxLLMRetries = Number(process.env.LLM_RETRY_MAX ?? 2);
      const baseTimeoutMs = Number(process.env.LLM_INVOKE_TIMEOUT_MS ?? 45000);
      const invokeTimeoutMs =
        provider === "gemini" ? Math.max(baseTimeoutMs, 120000) : baseTimeoutMs;
      let res: any = null;

      for (let attempt = 0; attempt <= maxLLMRetries; attempt++) {
        try {
          res = await llm.invoke([new HumanMessage(prompt)], {
            timeout: invokeTimeoutMs,
          } as any);
          break;
        } catch (e: any) {
          const errStr = String(e?.message || e || "");
          const rateLimited =
            /429|Too Many Requests|Too Many Req|rate limit|RateLimit/i.test(
              errStr,
            );
          const timedOut =
            /LLM invoke timeout|timed out|timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(
              errStr,
            );
          const serverError =
            /5\d\d|Service Unavailable|Gateway Timeout|Bad Gateway/i.test(
              errStr,
            );
          const shouldRetry =
            (rateLimited || timedOut || serverError) && attempt < maxLLMRetries;
          const backoffMs = Math.min(2 ** attempt * 1000, 30000); // 1s,2s,... up to 30s

          if (typeof context.emitEvent === "function") {
            try {
              context.emitEvent({
                type: "llm-retry",
                nodeId: context.nodeId,
                attempt: attempt + 1,
                provider: provider || "unknown",
                reason: rateLimited
                  ? "rate-limited"
                  : timedOut
                    ? "timeout"
                    : serverError
                      ? "server-error"
                      : "error",
                message: errStr.slice(0, 300),
                nextBackoffMs: shouldRetry ? backoffMs : 0,
              });
            } catch {}
          }

          if (shouldRetry) {
            try {
              await new Promise((r) => setTimeout(r, backoffMs));
            } catch {}
            continue;
          }

          throw e;
        }
      }

      if (!res) {
        throw new Error("LLM did not return a response after retries");
      }

      const text = String(res.content || "").trim();

      lastRawResponse = text;

      const extracted = extractReActJSON(text);
      if (!extracted) {
        loopGuard.recordParseFailure();
        const parseSummary = loopGuard.getSummary();
        if (typeof context.emitEvent === "function") {
          try {
            context.emitEvent({
              type: "parsing-failed",
              nodeId: context.nodeId,
              rawResponse: text.slice(0, 300),
              attempt: iteration + 1,
              consecutiveFailures: parseSummary.consecutiveParseFailures,
            });
          } catch {}
        }

        history.push(
          "Previous response could not be parsed. Please respond with only a JSON object containing the four expected keys: thought, action, actionInput, finalAnswer.",
        );
        trimHistory();

        const guardCheck = loopGuard.shouldStop();
        if (guardCheck.stop) {
          guardTriggered = true;
          guardStopReason = guardCheck.reason;
          break;
        }

        continue;
      }

      loopGuard.recordParseSuccess();
      iteration += 1;

      const parsed = validateReActResponse(extracted);
      const thought = parsed.thought;
      let action = parsed.action;
      let actionInput = parsed.actionInput;
      const finalAnswer = parsed.finalAnswer;

      // Handle parallel actions if provided
      if (
        parsed.parallelActions &&
        Array.isArray(parsed.parallelActions) &&
        parsed.parallelActions.length > 1
      ) {
        try {
          const parallelActions = parsed.parallelActions.map((p) => ({
            action: p.action,
            actionInput: p.actionInput,
          }));
          const parallelResults = await executeParallelTools(
            parallelActions,
            allowedToolMap,
            context,
            validateToolCall,
            validateToolInput,
            normalizeToolOutput,
            summarizeToolOutput,
            loopGuard,
          );

          const merged = mergeParallelResults(
            parallelResults,
            thought ?? "",
            iteration,
            maxIterations,
          );
          history.push(merged);
          trimHistory();

          // Record each action individually for loopGuard with parallel flag
          for (const a of parsed.parallelActions) {
            try {
              loopGuard.recordAction(String(a.action), true);
            } catch {}
          }
        } catch (err: any) {
          scratchpad.push(
            `[${iteration}] parallel execution error=${String(err?.message || err)}`,
          );
        }

        // Continue to next iteration after handling parallel batch
        continue;
      } else if (
        parsed.parallelActions &&
        Array.isArray(parsed.parallelActions) &&
        parsed.parallelActions.length === 1
      ) {
        // Single entry in parallelActions - treat as single action
        action = parsed.parallelActions[0].action;
        actionInput = parsed.parallelActions[0].actionInput;
      }

      if (action !== null && action !== undefined) {
        loopGuard.recordAction(String(action));
      }

      if (
        typeof action === "string" &&
        action.trim().toLowerCase() === "react-agent"
      ) {
        history.push(
          "Tool react-agent is not allowed within react-agent node.",
        );
        trimHistory();
        scratchpad.push("Rejected self-invocation of react-agent.");
        continue;
      }

      // Emit event for frontend if available
      if (typeof context.emitEvent === "function") {
        try {
          context.emitEvent({
            type: "node-stream",
            nodeId: context.nodeId,
            iteration,
            thought,
            action,
          });
        } catch {}
      }

      if (thought) {
        scratchpad.push(`[${iteration}] ${thought}`);
      }

      if (
        finalAnswer !== null &&
        finalAnswer !== undefined &&
        finalAnswer !== ""
      ) {
        return {
          success: true,
          output: {
            text: String(finalAnswer),
            message: "ReAct agent produced a final answer",
            data: { finalAnswer, scratchpad, iterations: iteration },
          },
        };
      }

      if (action) {
        const validation = validateToolCall(action, allowedToolMap, context);
        if (!validation.permitted) {
          loopGuard.recordDeniedAction(String(action ?? ""));
          const deniedAction = validation.normalizedAction || String(action);
          history.push(`Tool call denied: ${validation.reason}`);
          trimHistory();
          scratchpad.push(
            `[${iteration}] denied action=${deniedAction} reason=${validation.reason}`,
          );
          if (typeof context.emitEvent === "function") {
            try {
              context.emitEvent({
                type: "tool-denied",
                nodeId: context.nodeId,
                attemptedAction: action,
                reason: validation.reason,
              });
            } catch {}
          }
          continue;
        }

        const nodeDef = allowedToolMap.get(validation.normalizedAction);
        const toolSchema = inferToolSchema(nodeDef);
        const inputValidation = validateToolInput(
          actionInput,
          toolSchema,
          validation.normalizedAction,
        );

        if (!inputValidation.valid) {
          const schemaDescription = toolSchema.fields.length
            ? `Expected fields: ${toolSchema.fields
                .map(
                  (field) =>
                    `${field.name}${field.required ? " (required)" : ""}:${field.type}`,
                )
                .join(", ")}`
            : "No input schema available.";
          history.push(
            `Tool call to ${validation.normalizedAction} was rejected due to input validation errors: ${inputValidation.errors.join(
              "; ",
            )}. ${schemaDescription}`,
          );
          trimHistory();
          scratchpad.push(
            `[${iteration}] validation ${validation.normalizedAction} passed=false errors=${inputValidation.errors.length} warnings=${inputValidation.warnings.length} fields=${
              Object.keys(inputValidation.sanitized).join(", ") || "none"
            }`,
          );
          continue;
        }

        if (inputValidation.warnings.length > 0) {
          scratchpad.push(
            `[${iteration}] validation warnings for ${validation.normalizedAction}: ${inputValidation.warnings.join(
              "; ",
            )}`,
          );
        }

        scratchpad.push(
          `[${iteration}] validation ${validation.normalizedAction} passed=true errors=0 warnings=${inputValidation.warnings.length} fields=${
            Object.keys(inputValidation.sanitized).join(", ") || "none"
          }`,
        );

        // Execute the validated tool handler from the allow-list
        try {
          if (!nodeDef || typeof nodeDef.handler !== "function") {
            history.push(
              `Tool ${validation.normalizedAction} not found or has no handler`,
            );
            trimHistory();
            scratchpad.push(`Tool ${validation.normalizedAction} not found`);
            continue;
          }

          const sanitizedInput = inputValidation.sanitized;
          const execContext = {
            nodeId: `${context.nodeId}-react-tool-${iteration}`,
            nodeType: validation.normalizedAction,
            config: sanitizedInput || {},
            input: sanitizedInput || {},
            previousOutputs: context.previousOutputs || {},
            variables: context.variables || {},
            apiKeys: context.apiKeys || {},
            edges: context.edges,
            nodes: context.nodes,
            workflowId: context.workflowId,
            executionId: context.executionId,
            registry: context.registry,
          };

          const toolResult = await nodeDef.handler(execContext);
          if (toolResult?.success === false) {
            loopGuard.recordToolFailure(validation.normalizedAction);
          } else {
            loopGuard.recordToolSuccess(validation.normalizedAction);
          }

          let normalizedInput = toolResult;
          try {
            const serializedTool = JSON.stringify(toolResult);
            if (serializedTool.length > 50000) {
              scratchpad.push(
                "[warning] Tool returned an unusually large response; summarizing output for prompt safety.",
              );
              let outputSummary = "";
              try {
                const outputValue = toolResult?.output;
                outputSummary =
                  typeof outputValue === "string"
                    ? outputValue
                    : JSON.stringify(outputValue);
              } catch {
                outputSummary = "[unserializable output]";
              }
              normalizedInput = {
                success: toolResult?.success,
                error: toolResult?.error,
                output: outputSummary.slice(0, 2000),
              };
            }
          } catch {
            scratchpad.push(
              "[warning] Tool returned an unusually large or non-serializable response; summarizing output for prompt safety.",
            );
            let outputSummary = "";
            try {
              const outputValue = toolResult?.output;
              outputSummary =
                typeof outputValue === "string"
                  ? outputValue
                  : JSON.stringify(outputValue);
            } catch {
              outputSummary = "[unserializable output]";
            }
            normalizedInput = {
              success: toolResult?.success,
              error: toolResult?.error,
              output: outputSummary.slice(0, 2000),
            };
          }

          const toolText = normalizeToolOutput(normalizedInput);
          const summarizedToolText = summarizeToolOutput(
            toolText,
            validation.normalizedAction,
            iteration,
            taskInput,
          );
          history.push(
            buildContextEntry(
              validation.normalizedAction,
              iteration,
              thought ?? "",
              action ?? "",
              summarizedToolText,
              maxIterations,
            ),
          );
          trimHistory();
          scratchpad.push(`[${iteration}] action=${action} output=${toolText}`);
        } catch (err: any) {
          loopGuard.recordToolFailure(validation.normalizedAction);
          history.push(
            `Tool ${action} execution error: ${String(err?.message || err)}`,
          );
          trimHistory();
          scratchpad.push(
            `[${iteration}] action=${action} error=${String(err?.message || err)}`,
          );
        }

        // continue to next iteration
        continue;
      }

      // If no action and no final answer, add assistant reply and continue
      history.push(`Assistant response: ${text}`);
      trimHistory();
    } catch (err: any) {
      return {
        success: false,
        error: `ReAct agent error: ${err?.message || String(err)}`,
      };
    }
  }

  const guardSummary = loopGuard.getSummary();
  const resultReason = guardTriggered
    ? guardStopReason
    : `ReAct agent reached max iterations (${maxIterations}) without final answer`;
  const recoverable = guardTriggered
    ? /non-parseable/i.test(guardStopReason)
    : false;

  const failureToolType = Object.entries(guardSummary.perToolFailures)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([tool]) => tool)[0];

  const suggestedFix = guardTriggered
    ? /non-parseable/i.test(guardStopReason)
      ? "Review the system prompt and ensure the LLM is instructed to respond only in JSON."
      : /same tool failed/i.test(guardStopReason)
        ? failureToolType
          ? `Check the tool configuration and API keys for ${failureToolType}.`
          : "Check the tool configuration and API keys for the failing tool."
        : /cycling through the same two-step sequence/i.test(guardStopReason)
          ? "Add more specific instructions to the system prompt about when to stop and what constitutes task completion."
          : /unauthorized tool calls/i.test(guardStopReason)
            ? "Review the allowed tools list in the node configuration."
            : "Review task instructions and tool configuration, and consider whether the current loop needs clearer stop conditions."
    : "Review the task instructions and tool configuration, and consider increasing max iterations only if the task requires more steps.";

  return {
    success: false,
    error: resultReason,
    diagnostics: guardSummary,
    iterations: iteration,
    scratchpad,
    lastRawResponse,
    recoverable,
    suggestedFix,
  };
};

export default reactAgentHandler;
