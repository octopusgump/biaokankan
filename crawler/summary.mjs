export function buildSummary(projects, run, now = new Date(), partialSourceCount = 0) {
  const expiring = projects
    .filter((project) => project.bidDeadlineStatus === "confirmed" && project.bidDeadline)
    .filter((project) => {
      const deadline = new Date(`${project.bidDeadline.replace(" ", "T")}:00+08:00`);
      const diff = deadline.getTime() - now.getTime();
      return Number.isFinite(diff) && diff > 0 && diff <= 3 * 86_400_000;
    })
    .sort((a, b) => a.bidDeadline.localeCompare(b.bidDeadline));

  return {
    date: run.date,
    generatedAt: run.finishedAt,
    newProjectCount: projects.filter((project) => project.discoveredAt?.slice(0, 10) === run.date).length,
    expiringWithin3DaysCount: expiring.length,
    earliestProjects: expiring.slice(0, 3).map((project) => ({
      projectId: project.id,
      name: project.name,
      section: project.section,
      bidDeadline: project.bidDeadline,
      deadline: project.bidDeadline,
    })),
    abnormalSourceCount: run.sourceCount - run.succeededSources + partialSourceCount,
  };
}
