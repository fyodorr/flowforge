module.exports = {
    templateFields: [
        'disableEditor',
        'disableTours',
        'httpAdminRoot',
        'dashboardUI',
        'codeEditor',
        'theme',
        'page_title',
        'page_favicon',
        'header_title',
        'header_url',
        'timeZone',
        'palette_allowInstall',
        'palette_nodesExcludes',
        'palette_denyList',
        'palette_modules',
        'modules_allowInstall',
        'modules_denyList',
        'httpNodeAuth_type',
        'httpNodeAuth_user',
        'httpNodeAuth_pass'
    ],
    passwordTypes: [
        'httpNodeAuth_pass'
    ],
    defaultTemplateValues: {
        disableEditor: false,
        disableTours: false,
        httpAdminRoot: '',
        dashboardUI: '/ui',
        codeEditor: 'monaco',
        theme: 'forge-light',
        page_title: 'FlowForge',
        page_favicon: '',
        header_title: 'FlowForge',
        header_url: '',
        timeZone: 'UTC',
        palette_allowInstall: true,
        palette_nodesExcludes: '',
        palette_denyList: '',
        palette_modules: [],
        modules_allowInstall: true,
        modules_denyList: '',
        httpNodeAuth_type: '',
        httpNodeAuth_user: '',
        httpNodeAuth_pass: ''
    },
    defaultTemplatePolicy: {
        disableEditor: true,
        disableTours: true,
        httpAdminRoot: true,
        dashboardUI: true,
        codeEditor: true,
        theme: true,
        page_title: false,
        page_favicon: false,
        header_title: true,
        header_url: false,
        timeZone: true,
        palette_allowInstall: true,
        palette_nodesExcludes: false,
        palette_denyList: false,
        palette_modules: true,
        modules_allowInstall: true,
        modules_denyList: false,
        httpNodeAuth_type: true,
        httpNodeAuth_user: true,
        httpNodeAuth_pass: true
    }
}
