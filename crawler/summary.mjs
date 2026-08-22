import { classifyBidDeadline } from "../shared/project-time.mjs";

export function buildSummary(projects, run, now = new Date(), partialSourceCount = 0) {
  const classified = projects
    .filter((project) => project.bidDeadlineStatus === "confirmed" && project.bidDeadline)
    .map((project) => ({ project, deadlineState: classifyBidDeadline(project.bidDeadline, project.bidDeadlineStatus, now).deadlineState }))
    .sort((a, b) => a.project.bidDeadline.localeCompare(b.project.bidDeadline));
  const urgent = classified.filter((item) => item.deadlineState === "urgent").map((item) => item.project);
  const reminder = classified.filter((item) => item.deadlineState === "reminder").map((item) => item.project);
  const summarizeProject = (project) => ({
    projectId: project.id,
    name: project.name,
    section: project.section,
    bidDeadline: project.bidDeadline,
  });

  return {
    summaryVersion: 2,
    date: run.date,
    generatedAt: now.toISOString(),
    newProjectCount: projects.filter((project) => project.discoveredAt?.slice(0, 10) === run.date).length,
    urgentWithin7DaysCount: urgent.length,
    reminderFrom8To14DaysCount: reminder.length,
    urgentProjects: urgent.slice(0, 3).map(summarizeProject),
    reminderProjects: reminder.slice(0, 3).map(summarizeProject),
    abnormalSourceCount: run.sourceCount - run.succeededSources + partialSourceCount,
  };
}
