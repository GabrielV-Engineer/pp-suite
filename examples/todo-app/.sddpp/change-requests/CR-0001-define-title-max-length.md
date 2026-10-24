---
id: CR-0001
title: Define the maximum title length
status: open
raised_by: SL-004
affects:
  quality_attributes: [QA-004]
---

## Problem

SL-004 must reject over-long titles, but QA-004 does not say how long is too long. The slice would
have to invent a number, and the builder should not decide that alone.

## Proposal

Add a limit to the QA-004 scenario in `blueprint.yaml`, for example 200 characters, and bump the
blueprint `revision`. SL-004's second acceptance criterion then becomes testable.
