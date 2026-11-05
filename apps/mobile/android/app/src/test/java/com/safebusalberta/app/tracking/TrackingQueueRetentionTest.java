package com.safebusalberta.app.tracking;
import org.junit.Test;
import static org.junit.Assert.*;
public class TrackingQueueRetentionTest {
 @Test public void retainsBoundaryRecentReceiptAndUnknownClock() {
  long start=1000000000000L;long age=TrackingQueueRetention.MAX_AGE_MILLIS;
  assertFalse(TrackingQueueRetention.expired(start,start,start+age));
  assertTrue(TrackingQueueRetention.expired(start,start,start+age+1));
  assertFalse(TrackingQueueRetention.expired(start,start+age,start+age+1));
  assertFalse(TrackingQueueRetention.expired(start,start,start-1));
  assertFalse(TrackingQueueRetention.expired(start,0,start+age+1));
 }
}
