"""On-demand molecule generation (spec docs/superpowers/specs/2026-10-05-on-demand-generation-design.md).

Everything here except worker.py, make_basis_counts.py and calibrate.py
imports without PySCF or NumPy: the AWS api Lambda (Phase 6B-3) ships this
package alone, so the chemistry it needs is in committed tables instead.
"""
