package com.shuttercat.android;

import java.time.Instant;
import java.util.Collection;

public final class TaskRules {
    public static final long BEDTIME_DURATION_MS = 6 * 60 * 60 * 1000L;
    private TaskRules() {}
    public static final class Task {
        public final String id, title, status, kind;
        public final long scheduledAt;
        public Task(String id, String title, String status, long scheduledAt) {
            this(id, title, status, scheduledAt, "photo");
        }
        public Task(String id, String title, String status, long scheduledAt, String kind) {
            this.id = id; this.title = title; this.status = status; this.scheduledAt = scheduledAt; this.kind = kind;
        }
    }
    public static long parseTimestamp(String value) { return Instant.parse(value).toEpochMilli(); }
    public static boolean pending(Task task, long now) {
        if ("bedtime".equals(task.kind)) return ("scheduled".equals(task.status) || "sleeping".equals(task.status))
            && task.scheduledAt <= now && now < task.scheduledAt + BEDTIME_DURATION_MS;
        return "waiting_proof".equals(task.status)
            || ("scheduled".equals(task.status) && task.scheduledAt <= now);
    }
    public static boolean shouldGuard(boolean enabled, boolean selected, Collection<Task> tasks, long now) {
        if (!enabled || !selected) return false;
        for (Task task : tasks) if (pending(task, now)) return true;
        return false;
    }
    public static long nextCheckDelay(Collection<Task> tasks, long now) {
        long delay = 30_000;
        for (Task task : tasks) {
            if ("bedtime".equals(task.kind) && pending(task, now))
                delay = Math.min(delay, task.scheduledAt + BEDTIME_DURATION_MS - now);
            if ("scheduled".equals(task.status) && task.scheduledAt > now)
                delay = Math.min(delay, task.scheduledAt - now + 50);
        }
        return Math.max(100, delay);
    }
    public static long bedtimeUntil(Collection<Task> tasks, long now) {
        long end = 0;
        for (Task task : tasks) if ("bedtime".equals(task.kind) && pending(task, now))
            end = Math.max(end, task.scheduledAt + BEDTIME_DURATION_MS);
        return end;
    }
}
