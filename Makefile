HUGO_VERSION := 0.159.2
SITE_DIR := site
HUGO_CACHEDIR := $(CURDIR)/.hugo_cache
DEPLOY_HOST ?= moneymachine
DEPLOY_USER ?= root
DEPLOY_PATH ?= /var/www/juan-website

.PHONY: help check build serve clean deploy rollback install-hooks

help:
	@echo "Available targets:"
	@echo "  make check          Verify required local tools"
	@echo "  make build          Build the static site"
	@echo "  make serve          Preview at http://localhost:8080"
	@echo "  make clean          Remove generated files"
	@echo "  make deploy         Build and deploy directly over SSH"
	@echo "  make rollback       Restore the previous VPS deploy"
	@echo "  make install-hooks  Enable repository Git hooks"

check:
	@command -v hugo >/dev/null || { echo "hugo is required (expected $(HUGO_VERSION))"; exit 1; }
	@command -v git >/dev/null || { echo "git is required"; exit 1; }

build: check
	cd $(SITE_DIR) && HUGO_CACHEDIR=$(HUGO_CACHEDIR) hugo --minify --gc

serve: check
	cd $(SITE_DIR) && HUGO_CACHEDIR=$(HUGO_CACHEDIR) hugo server --bind 0.0.0.0 --port 8080 --buildDrafts

clean:
	rm -rf $(SITE_DIR)/public $(HUGO_CACHEDIR)

deploy: build
	rsync -avz --delete $(SITE_DIR)/public/ $(DEPLOY_USER)@$(DEPLOY_HOST):$(DEPLOY_PATH)/

rollback:
	DEPLOY_HOST=$(DEPLOY_HOST) DEPLOY_USER=$(DEPLOY_USER) DEPLOY_PATH=$(DEPLOY_PATH) scripts/rollback.sh

install-hooks:
	git config core.hooksPath git-hooks
