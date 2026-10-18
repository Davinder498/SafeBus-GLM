# Guardian profile and family service line

The guardian profile menu has one **Privacy Notice** action. The duplicate
**Privacy & account** action is removed for guardians. The notice retains its
link to account-deletion instructions. Driver account access is unchanged.

The bus-detail service line displays the service start and the pickup/drop-off
stops identified for this guardian's linked students by the existing authorized
RPC. A shared stop appears once with the names of both children; distinct stops
remain in the service's travel order, including return services. The final
assigned drop-off ends the family line. If no assigned drop-off is available,
the route end remains as a fallback and is labelled End, without inventing a
drop-off assignment. Unrelated stops are omitted from the visible line and its
next-stop text and announcements.

The live marker projects the verified full-route position onto the retained
anchors using their original indexes. Hidden stops do not move the marker ahead
or change stop ETAs. After the final family drop-off the marker stays at that
line's end. Freshness, pause, invalid-location and unavailable-progress checks
remain in place. This is a presentation change; it adds no database reads,
grants, policies, migrations or changes to the authorized response contract.

Validation covers shared and distinct student stops, start/pickup overlap,
return order, missing drop-offs, repeated stop names and projection across hidden
stops. Mobile browser checks cover both directions with two linked students,
the existing marker-resize/reduced-motion behavior, profile-menu deduplication,
privacy accessibility and account-deletion navigation. Public/admin privacy
navigation uses the same **Privacy Notice** capitalization.
