# Road path editor acceptance

Open the assigned route's detail page from Routes as a tenant administrator.
Use the Road path panel to draw the actual outbound road path, adding points at
every bend, or import one GeoJSON LineString (geometry, Feature, or a single-feature
FeatureCollection). The editor joins points directly; it does not automatically
route or snap them onto roads. Trace the complete road journey rather than
connecting only the stops.

Save a draft, verify it against the numbered stops and map, finish drawing, check
the review box, and publish the reviewed saved version. Publication archives the
previous current version. Editing a published version creates a new draft; it
does not overwrite a trip's historical geometry.

The existing database stores one shared path per route. Return runs use reverse
stop order. If outbound and return travel different roads, configure separate
routes rather than publishing a path that represents only one journey.

For Demo Bus 01, publish the path for its assigned route through the authorized
admin UI after release, then start a new run. Trips snapshot the current published
shape at start; an existing run that started without a shape stays unchanged.
Observe the guardian service-line marker through bends as well as straight roads,
and compare it with the live map. Review GPS freshness, off-route handling, and both
directions. This feature does not change ETA confidence or projection tolerances.

Automated browser acceptance uses intercepted synthetic RPCs and map tiles:
draw/undo, curved-path import, draft save, immutable draft publication, unsaved-edit
publication prevention, failure recovery, and map-outage publication prevention.
No production records are created or changed by automated verification.
