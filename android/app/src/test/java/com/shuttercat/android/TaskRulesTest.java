package com.shuttercat.android;

import static org.junit.Assert.*;
import java.util.List;
import org.junit.Test;

public class TaskRulesTest {
    @Test public void bedtimeExpiresOfflineAtSixHoursAndNeverWaitsForProof() {
        long start = TaskRules.parseTimestamp("2026-10-20T23:00:00+08:00");
        TaskRules.Task sleep = new TaskRules.Task("sleep", "按时睡觉", "scheduled", start, "bedtime");
        long end = start + TaskRules.BEDTIME_DURATION_MS;
        assertFalse(TaskRules.pending(sleep, start - 1));
        assertTrue(TaskRules.pending(sleep, start));
        assertTrue(TaskRules.pending(sleep, end - 1));
        assertFalse(TaskRules.pending(sleep, end));
        assertFalse(TaskRules.pending(sleep, end + 3600000));
        assertEquals(end, TaskRules.bedtimeUntil(List.of(sleep), start + 1));
        assertEquals(0, TaskRules.bedtimeUntil(List.of(sleep), end));
        assertEquals(500, TaskRules.nextCheckDelay(List.of(sleep), end - 500));
    }
    @Test public void bedtimeExpiryDoesNotClearOtherTasksAndRequiresPermissionAndSelection() {
        TaskRules.Task sleep = new TaskRules.Task("sleep", "按时睡觉", "sleeping", 1000, "bedtime");
        long end = 1000 + TaskRules.BEDTIME_DURATION_MS;
        assertFalse(TaskRules.shouldGuard(false, true, List.of(sleep), 2000));
        assertFalse(TaskRules.shouldGuard(true, false, List.of(sleep), 2000));
        assertTrue(TaskRules.shouldGuard(true, true, List.of(sleep), 2000));
        assertFalse(TaskRules.shouldGuard(true, true, List.of(sleep), end));
        assertTrue(TaskRules.shouldGuard(true, true, List.of(sleep, task("work", "waiting_proof", 1000)), end));
        assertFalse(TaskRules.pending(new TaskRules.Task("sleep", "按时睡觉", "slept", 1000, "bedtime"), 2000));
    }
    private TaskRules.Task task(String id, String status, long at) { return new TaskRules.Task(id, "写论文", status, at); }
    @Test public void requiresConsentAndSelection() {
        List<TaskRules.Task> tasks = List.of(task("1", "waiting_proof", 100));
        assertTrue(TaskRules.shouldGuard(true, true, tasks, 1000));
        assertFalse(TaskRules.shouldGuard(false, true, tasks, 1000));
        assertFalse(TaskRules.shouldGuard(true, false, tasks, 1000));
    }
    @Test public void becomesDueWithoutServerRefresh() {
        TaskRules.Task t = task("1", "scheduled", 2000);
        assertFalse(TaskRules.pending(t, 1999));
        assertTrue(TaskRules.pending(t, 2000));
    }
    @Test public void waitsUntilAllDueTasksAreSettled() {
        assertTrue(TaskRules.shouldGuard(true, true, List.of(task("1", "started", 100), task("2", "waiting_proof", 100)), 1000));
        assertFalse(TaskRules.shouldGuard(true, true, List.of(task("1", "started", 100), task("2", "escaped", 100), task("3", "scheduled", 2000)), 1000));
        assertFalse(TaskRules.shouldGuard(true, true, List.of(), 1000));
    }
    @Test public void schedulesNearestFutureTaskAndRechecksClock() {
        assertEquals(1050, TaskRules.nextCheckDelay(List.of(task("1", "scheduled", 2000), task("2", "scheduled", 5000)), 1000));
        assertEquals(30000, TaskRules.nextCheckDelay(List.of(task("1", "scheduled", 50000)), 1000));
    }
    @Test public void parsesServerUtcAndOffsetTimes() {
        assertEquals(TaskRules.parseTimestamp("2026-09-28T01:00:00.000Z"), TaskRules.parseTimestamp("2026-09-28T09:00:00+08:00"));
    }
}
