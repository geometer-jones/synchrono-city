import type { GeoNote, Place } from "./data";

const cohortTag = "cohort";
const hybridTag = "hybrid";
const urlPattern = /https?:\/\/[^\s)]+/gi;

const curriculumLabels: Record<string, string> = {
  "zero-to-hero": "Zero to Hero"
};

const levelLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

export type CohortArtifact = {
  url: string;
  label: string;
  noteId: string;
  createdAt: string;
};

export type CohortBeaconMetadata = {
  isCohort: true;
  curriculum?: string;
  curriculumLabel?: string;
  level?: string;
  levelLabel?: string;
  hybrid: boolean;
  weekLabel?: string;
  weekIndex?: number;
  weekCount?: number;
  currentConcept?: string;
  nextSession?: string;
  prompt?: string;
  joinPosture: string;
  summary?: string;
  artifact?: CohortArtifact;
  recentArtifacts: CohortArtifact[];
};

export function isCohortPlace(place: Place | undefined) {
  return place ? hasTag(place.tags, cohortTag) : false;
}

export function buildCohortBeaconMetadata(
  place: Place | undefined,
  pinnedNote: GeoNote | undefined,
  notes: GeoNote[]
): CohortBeaconMetadata | null {
  if (!place || !isCohortPlace(place)) {
    return null;
  }

  const tags = normalizeTags(place.tags);
  const fields = parsePinnedNoteFields(pinnedNote?.content ?? "");
  const week = resolveWeek(fields, pinnedNote?.content ?? "");
  const artifactFromPinnedNote = pinnedNote ? resolveArtifact(pinnedNote, fields.artifact) : undefined;
  const recentArtifacts = collectRecentArtifacts(notes, artifactFromPinnedNote?.url);
  const curriculum = tagValue(tags, "curriculum");
  const level = tagValue(tags, "level");
  const summary = resolveSummary(pinnedNote?.content ?? "");

  return {
    isCohort: true,
    curriculum,
    curriculumLabel: curriculum ? formatTagLabel(curriculum, curriculumLabels) : undefined,
    level,
    levelLabel: level ? formatTagLabel(level, levelLabels) : undefined,
    hybrid: hasTag(tags, hybridTag),
    weekLabel: week.label,
    weekIndex: week.index,
    weekCount: week.count,
    currentConcept: firstNonEmpty(fields.concept, fields.focus, fields.topic),
    nextSession: firstNonEmpty(fields.next, fields["next session"], fields.session),
    prompt: firstNonEmpty(fields.prompt, fields.exercise),
    joinPosture:
      firstNonEmpty(fields.join, fields.posture, fields.risk) ??
      "Join muted first. Listen before you speak.",
    summary: summary || undefined,
    artifact: artifactFromPinnedNote,
    recentArtifacts
  };
}

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

function hasTag(tags: string[], wanted: string) {
  return normalizeTags(tags).includes(wanted);
}

function tagValue(tags: string[], prefix: string) {
  const normalizedPrefix = `${prefix.toLowerCase()}:`;

  for (const tag of tags) {
    if (tag.startsWith(normalizedPrefix)) {
      return tag.slice(normalizedPrefix.length).trim();
    }
  }

  return undefined;
}

function formatTagLabel(value: string, explicitLabels: Record<string, string>) {
  const explicit = explicitLabels[value];
  if (explicit) {
    return explicit;
  }

  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function parsePinnedNoteFields(content: string) {
  const fields: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, "");
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      continue;
    }

    fields[key] = value;
  }

  return fields;
}

function resolveWeek(fields: Record<string, string>, content: string) {
  const candidate = firstNonEmpty(fields.week, fields.current, content.match(/week\s+\d+(?:\s*\/\s*\d+)?/i)?.[0]);
  if (!candidate) {
    return {
      label: undefined,
      index: undefined,
      count: undefined
    };
  }

  const match = candidate.match(/(\d+)(?:\s*\/\s*(\d+))?/);
  if (!match) {
    return {
      label: candidate,
      index: undefined,
      count: undefined
    };
  }

  const index = Number.parseInt(match[1] ?? "", 10);
  const count = match[2] ? Number.parseInt(match[2], 10) : undefined;
  if (!Number.isFinite(index)) {
    return {
      label: candidate,
      index: undefined,
      count: undefined
    };
  }

  return {
    label: count ? `Week ${index} of ${count}` : `Week ${index}`,
    index,
    count
  };
}

function resolveArtifact(note: GeoNote, fieldValue?: string): CohortArtifact | undefined {
  const candidate = fieldValue ?? note.content;
  const url = extractUrls(candidate)[0];
  if (!url) {
    return undefined;
  }

  return {
    url,
    label: resolveArtifactLabel(fieldValue ?? note.content, url),
    noteId: note.id,
    createdAt: note.createdAt
  };
}

function collectRecentArtifacts(notes: GeoNote[], excludeURL?: string) {
  const seen = new Set<string>(excludeURL ? [excludeURL] : []);
  const artifacts: CohortArtifact[] = [];

  for (const note of notes) {
    for (const url of extractUrls(note.content)) {
      if (seen.has(url)) {
        continue;
      }

      seen.add(url);
      artifacts.push({
        url,
        label: resolveArtifactLabel(note.content, url),
        noteId: note.id,
        createdAt: note.createdAt
      });

      if (artifacts.length >= 3) {
        return artifacts;
      }
    }
  }

  return artifacts;
}

function resolveArtifactLabel(content: string, url: string) {
  const withoutURL = content.replace(url, "").replace(/\s+/g, " ").trim();
  if (withoutURL) {
    return withoutURL;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function resolveSummary(content: string) {
  for (const rawParagraph of content.split(/\n\s*\n/)) {
    const paragraph = rawParagraph
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^[a-z ]+:/i.test(line))
      .join(" ")
      .trim();

    if (paragraph) {
      return paragraph;
    }
  }

  return "";
}

function extractUrls(text: string) {
  return Array.from(new Set(text.match(urlPattern) ?? []));
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}
