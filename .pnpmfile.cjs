module.exports = {
  hooks: {
    beforePacking(pkg) {
      const commit = process.env.FAST_LINK_RELEASE_COMMIT;
      if (!/^[a-f0-9]{40}$/.test(commit ?? '')) {
        throw new Error('FAST_LINK_RELEASE_COMMIT must be a full commit SHA');
      }
      return { ...pkg, gitHead: commit };
    },
  },
};
