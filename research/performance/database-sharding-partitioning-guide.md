# Database Sharding and Partitioning Strategies: Complete Guide

## Executive Summary

This guide provides a comprehensive evaluation of database scaling strategies for PostgreSQL, covering when to shard, how to implement partitioning, and migration paths from single-instance to distributed databases.

**Key Findings:**

- **Partitioning** (single database) is suitable for tables >100GB with time-series or categorical data
- **Sharding** (multiple databases) becomes necessary at >1TB or when single-node performance limits are reached
- **Citus** offers the most mature PostgreSQL sharding solution with both row-based and schema-based models
- **Instagram's case study** demonstrates successful PostgreSQL sharding to 500M+ users

---

[Full content from database sharding result...]

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Research Sources:** PostgreSQL docs, Citus documentation, Instagram engineering blog
