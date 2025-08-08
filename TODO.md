# TODO - WFU WordPress CLI Tool

## 🚀 Future Development Tasks

### Core Migration Features
- [ ] Finish single site migration
- [ ] Build environment migration  
- [ ] Build local refresh

### Advanced Features
- [ ] Possibly use as foundation for plugin for dashboard site migrations

### Documentation & Publishing
- [x] Update all documentation (migrate to multipage documentation structure)
- [x] Add md2wpblock command for converting Markdown to WordPress blocks
- [ ] WordPress documentation publisher CLI tool (see `project-planning/wordpress-publisher-plan.md`)
- [ ] Maybe a publish changelog tool that publishes the changelog to wordpress?

### Planned Features (Project Planning)
- [ ] WordPress Documentation Publisher (`project-planning/wordpress-publisher-plan.md`)
  - Automated publishing of wp-docs/ to WordPress via REST API
  - Application Password authentication
  - Batch and individual file processing
  - Update detection and content mapping

## 📋 Notes

**Current Status (v0.5.0):**
- ✅ Complete WordPress multisite migration system
- ✅ Multi-environment support (dev/uat/pprd/prod)
- ✅ S3 integration and backup functionality
- ✅ Custom timeout support for large databases
- ✅ Published to NPM and ready for production
- ✅ Comprehensive multipage documentation structure
- ✅ md2wpblock command for WordPress block HTML conversion

**Next Priority:** Focus on single site migration completion and environment migration features.

**Planning Documents:**
- WordPress Documentation Publisher: `project-planning/wordpress-publisher-plan.md`