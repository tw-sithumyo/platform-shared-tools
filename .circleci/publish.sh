#!/bin/bash
#set -x

# The root directory of packages to publish
ROOT="./packages"
REPOSITORY_TYPE="github"
# Move to circleCi file
DOCKER_BUILD_PLATFORMS=linux/amd64
DOCKER_LATEST_RELEASE_NAME=snapshot

printHeader "Phase 4 - Building docker images and publishing to DockerHub"

PUBLISHED_DOCKERHUB_PACKAGES_COUNT=0

echo -e "  Docker version: $(docker --version)"
echo -e "  Logging in to dockerhub..."
echo "$DOCKER_PASS" | docker login --username $DOCKER_USER --password-stdin
echo -e "  Create docker builder, bootstrap it and use it..."
docker buildx create --name mybuilder --use --bootstrap
docker buildx ls

SHORT_GIT_HASH=$(echo $CIRCLE_SHA1 | cut -c -7)

PACKAGE_PATH="${ROOT}/admin-ui"
PACKAGE_NAME=$(cat ${PACKAGE_PATH}/package.json | jq -r ".name")
DOCKER_IMAGE_NAME=$(echo $PACKAGE_NAME | sed -e 's/@//')
PACKAGE_CUR_VERSION=$(cat ${PACKAGE_PATH}/package.json | jq -r ".version")
PACKAGE_PUBLISH_FLAG=$(cat $PACKAGE_PATH/package.json | jq -r ".mojaloop.publish_to_dockerhub // false")


echo -e "\tName: \t\t${PACKAGE_NAME}"
echo -e "\tCur version: \t${PACKAGE_CUR_VERSION}"
echo -e "\tPublish flag: \t${PACKAGE_PUBLISH_FLAG}"

if [[ ! "$PACKAGE_PUBLISH_FLAG" = "true" ]]; then
    echo -e "\n\tIGNORING package without 'mojaloop.publish_to_dockerhub' flag set to 'true' in package.json"
    continue
fi

## increase patch version only
npm -w ${PACKAGE_NAME} version patch --no-git-tag-version --no-workspaces-update >/dev/null 2>&1

PACKAGE_NEW_VERSION=$(cat ${PACKAGE_PATH}/package.json | jq -r ".version")
DOCKER_TAG_PREV_VERSION=${DOCKER_IMAGE_NAME}:${PACKAGE_CUR_VERSION}
DOCKER_TAG_VERSION=${DOCKER_IMAGE_NAME}:${PACKAGE_NEW_VERSION}
DOCKER_TAG_SHORT_GIT_HASH=${DOCKER_IMAGE_NAME}:${SHORT_GIT_HASH}
DOCKER_TAG_LATEST_RELEASE=${DOCKER_IMAGE_NAME}:${DOCKER_LATEST_RELEASE_NAME}

echo -e "\tNew version: \t${PACKAGE_NEW_VERSION}"
echo -e "\tVersion Tag: \t${DOCKER_TAG_VERSION}"
echo -e "\tCommit Tag: \t${DOCKER_TAG_SHORT_GIT_HASH}"
echo -e "\tRelease Tag: \t${DOCKER_TAG_LATEST_RELEASE}"


if [[ -n "$DRYRUN" ]]; then
    echo -e "\nDryrun env var found - not actually building and publishing docker image"
    continue
fi

echo -e "\n\tBuilding and publishing docker image..."

echo -e "---------------- DOCKER BUILD AND PUBLISH START ----------------------\n"

#    docker buildx build --platform ${DOCKER_BUILD_PLATFORMS} --cache-from=${DOCKER_TAG_LATEST_RELEASE} \
docker buildx build --progress plain --platform ${DOCKER_BUILD_PLATFORMS} --push \
    --cache-from=${DOCKER_TAG_PREV_VERSION} \
    -f ${PACKAGE_PATH}/Dockerfile \
    -t ${DOCKER_TAG_VERSION} -t ${DOCKER_TAG_SHORT_GIT_HASH} -t ${DOCKER_TAG_LATEST_RELEASE} \
    .
BUILD_AND_PUB_SUCCESS=$?
echo -e "\n---------------- DOCKER BUILD AND PUBLISH END ----------------------"

if [[ BUILD_AND_PUB_SUCCESS -eq 0 ]]; then
    PUBLISHED_DOCKERHUB_PACKAGES_COUNT=$((PUBLISHED_DOCKERHUB_PACKAGES_COUNT + 1))
    TAG_NAME=${PACKAGE}_v${PACKAGE_NEW_VERSION}
    echo -e "Successfully published docker image."
    echo -e "Git staging '${PACKAGE_PATH}/package.json, committing and tagging with: '${TAG_NAME}'"
else
    echo -e "Error publishing package: ${PACKAGE} - exiting"
    exit 1
fi
