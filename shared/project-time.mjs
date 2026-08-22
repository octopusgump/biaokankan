export const BID_DEADLINE_STATUSES = ["confirmed", "document_required", "pending"];
export const DAY_MS = 86_400_000;
export const URGENT_LIMIT_MS = 7 * DAY_MS;
export const REMINDER_LIMIT_MS = 14 * DAY_MS;

export function parseChinaDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const instant = new Date(`${value.replace(" ", "T")}:00+08:00`);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function classifyBidDeadline(bidDeadline, bidDeadlineStatus, now = new Date()) {
  const status = BID_DEADLINE_STATUSES.includes(bidDeadlineStatus)
    ? bidDeadlineStatus
    : bidDeadline
      ? "confirmed"
      : "pending";

  if (status !== "confirmed" || !bidDeadline) {
    return { deadlineState: "pending", remainingDays: null };
  }

  const instant = parseChinaDateTime(bidDeadline);
  if (!instant) return { deadlineState: "pending", remainingDays: null };

  const diff = instant.getTime() - now.getTime();
  if (diff <= 0) return { deadlineState: "expired", remainingDays: 0 };

  const remainingDays = Math.ceil(diff / DAY_MS);
  if (diff <= URGENT_LIMIT_MS) return { deadlineState: "urgent", remainingDays };
  if (diff <= REMINDER_LIMIT_MS) return { deadlineState: "reminder", remainingDays };
  return { deadlineState: "normal", remainingDays };
}

export function bidDeadlinePresentation(bidDeadline, bidDeadlineStatus, now = new Date()) {
  const status = BID_DEADLINE_STATUSES.includes(bidDeadlineStatus)
    ? bidDeadlineStatus
    : bidDeadline
      ? "confirmed"
      : "pending";

  if (status === "document_required") {
    return {
      deadlineShort: "待核验",
      remaining: "公告注明：见招标文件",
      deadlineState: "pending",
    };
  }
  if (status !== "confirmed" || !bidDeadline) {
    return {
      deadlineShort: "待核验",
      remaining: "时间无法可靠识别",
      deadlineState: "pending",
    };
  }

  const deadlineShort = `${bidDeadline.slice(5, 7)}月${bidDeadline.slice(8, 10)}日 ${bidDeadline.slice(11, 16)}`;
  const classification = classifyBidDeadline(bidDeadline, status, now);
  if (classification.deadlineState === "pending") {
    return { deadlineShort: "待核验", remaining: "时间无法可靠识别", deadlineState: "pending" };
  }
  if (classification.deadlineState === "expired") {
    return { deadlineShort, remaining: "已截止", deadlineState: "expired" };
  }
  const prefix = classification.deadlineState === "urgent"
    ? "紧急"
    : classification.deadlineState === "reminder"
      ? "提醒"
      : null;
  const remaining = `剩余 ${classification.remainingDays} 天`;
  return {
    deadlineShort,
    remaining: prefix ? `${prefix} · ${remaining}` : remaining,
    deadlineState: classification.deadlineState,
  };
}

export function documentAcquirePresentation(start, deadline, now = new Date()) {
  if (!start && !deadline) return null;
  const startInstant = parseChinaDateTime(start);
  const deadlineInstant = parseChinaDateTime(deadline);
  let status = "pending";
  let label = "时间待核验";

  if (startInstant && now.getTime() < startInstant.getTime()) {
    status = "not_started";
    label = "未开始";
  } else if (deadlineInstant && now.getTime() > deadlineInstant.getTime()) {
    status = "ended";
    label = "已结束";
  } else if (startInstant || deadlineInstant) {
    status = "active";
    label = "获取中";
  }

  const focus = deadline || start;
  return {
    status,
    label,
    short: focus ? `${focus.slice(5, 7)}月${focus.slice(8, 10)}日 ${focus.slice(11, 16)}` : "待核验",
  };
}

export function formatDocumentAcquireWindow(start, deadline, now = new Date()) {
  const presentation = documentAcquirePresentation(start, deadline, now);
  if (!presentation) return "待核验";
  const range = start && deadline
    ? `${start} 至 ${deadline}`
    : start
      ? `${start} 起`
      : `截至 ${deadline}`;
  return `${range}（${presentation.label}）`;
}

export function normalizeProjectTimeFields(project, now = new Date()) {
  const hasBidDeadline = Object.prototype.hasOwnProperty.call(project, "bidDeadline");
  const bidDeadline = hasBidDeadline ? project.bidDeadline : project.deadline || null;
  let bidDeadlineStatus = BID_DEADLINE_STATUSES.includes(project.bidDeadlineStatus)
    ? project.bidDeadlineStatus
    : bidDeadline
      ? "confirmed"
      : "pending";
  if (bidDeadlineStatus === "confirmed" && !bidDeadline) bidDeadlineStatus = "pending";
  const presentation = bidDeadlinePresentation(bidDeadline, bidDeadlineStatus, now);

  return {
    ...project,
    bidDeadline,
    bidDeadlineStatus,
    bidDeadlineEvidence: project.bidDeadlineEvidence || (bidDeadline
      ? "由历史 deadline 字段兼容迁移；请以原公告为准"
      : null),
    bidDeadlineVerifiedAt: project.bidDeadlineVerifiedAt || (bidDeadline
      ? project.lastVerifiedAt || project.updatedAt || null
      : null),
    documentAcquireStart: project.documentAcquireStart || null,
    documentAcquireDeadline: project.documentAcquireDeadline || null,
    deadline: bidDeadline,
    ...presentation,
  };
}
